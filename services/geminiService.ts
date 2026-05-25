import { GoogleGenAI } from '@google/genai';
import {
    DEFAULT_SAFETY_THRESHOLDS,
    GenerateOptions,
    GenerateResponse,
    ImageReceivedResult,
    ResultImagePart,
    ResultPart,
    ResultTextPart,
    type SafetyThresholds,
} from '../types';
import {
    buildImageToPromptInstruction,
    buildPromptEnhancerInstruction,
    buildRandomPromptInstruction,
    buildRandomPromptRequest,
    normalizePromptToolLanguage,
} from '../utils/geminiPromptHelpers';
import { buildSafetySettings } from '../utils/geminiApiConfig';
import {
    attachGenerationFailure,
    getGenerationFailure,
    normalizeGenerationFailureInfo,
    resolveGenerationFailureInfo,
} from '../utils/generationFailure';
import { buildBrowserConversationHistory, buildBrowserGenerateParts } from '../utils/browserGeminiParts';
import { extractGeneratedContent } from '../utils/geminiResponseExtraction';
import { LiveProgressStreamTruthSummary, summarizeLiveProgressTruthfulness } from '../utils/liveProgressCapabilities';
import { hasConfiguredGeminiApiKey, promptForGeminiApiKey, resolveGeminiApiKey } from '../utils/geminiCredentials';
import { loadImageDimensions } from '../utils/imageSaveUtils';
import { buildStyleAwareImagePrompt } from '../utils/stylePromptBuilder';
import { DEFAULT_TEMPERATURE, normalizeTemperature } from '../utils/temperature';
import { Language } from '../utils/translations';
import { extractGroundingDetails } from '../utils/geminiGroundingExtraction';
import { buildImageRequestConfig, validateCapabilityRequest } from '../utils/geminiRequestConfig';
import { emitDebugTerminalEvent } from '../utils/debugTerminalEvents';

function isAbortLikeError(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.message === 'ABORTED')
    );
}

function throwIfAborted(abortSignal?: AbortSignal): void {
    if (abortSignal?.aborted) {
        throw new Error('ABORTED');
    }
}

function withAbortSignal<T extends { abortSignal?: AbortSignal }>(config: T, abortSignal?: AbortSignal): T {
    return abortSignal ? { ...config, abortSignal } : config;
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
        response = await fetch(input, init);
    } catch (error) {
        if (isAbortLikeError(error)) {
            throw new Error('ABORTED');
        }
        throw error;
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const errorMessage =
            payload && typeof payload.error === 'string'
                ? payload.error
                : `Request failed with status ${response.status}`;
        const requestError = new Error(errorMessage) as Error & {
            status?: number;
        };
        requestError.name = 'ApiRequestError';
        requestError.status = response.status;

        const failure = normalizeGenerationFailureInfo(payload?.failure);
        if (failure) {
            throw attachGenerationFailure(requestError, failure);
        }

        throw requestError;
    }

    return payload as T;
}

export type GenerationLiveProgressEvent =
    | {
          type: 'start';
          sessionId: string;
          slotIndex?: number;
          batchSessionId?: string;
      }
    | {
          type: 'result-part';
          sessionId: string;
          part: ResultPart;
          slotIndex?: number;
          batchSessionId?: string;
      }
    | {
          type: 'summary';
          sessionId: string;
          summary: LiveProgressStreamTruthSummary;
          slotIndex?: number;
          batchSessionId?: string;
      };

type GenerationLiveProgressEventContext = {
    slotIndex?: number;
    batchSessionId?: string;
};

type LiveProgressClientAccumulator = {
    resultParts: ResultPart[];
    summary: LiveProgressStreamTruthSummary | null;
};

type StreamGenerationResponse = {
    response: GenerateResponse;
    didReceiveStreamEvent: boolean;
};

type InlinePromptToolImage = {
    data: string;
    mimeType: string;
};

type GenerationResultPartialResponse = Pick<
    GenerateResponse,
    'text' | 'thoughts' | 'resultParts' | 'metadata' | 'grounding' | 'sessionHints' | 'conversation'
>;

type InitialBatchAttemptOutcome = {
    result: GenerationResult;
    needsRecovery: boolean;
};

type BrowserLiveProgressAccumulator = {
    resultParts: ResultPart[];
    orderingStable: boolean;
    preCompletionArtifactCount: number;
    firstPreCompletionArtifactKind: LiveProgressStreamTruthSummary['firstPreCompletionArtifactKind'];
    thoughtSignatureObserved: boolean;
};

type PreparedBrowserGenerateRequest = {
    debugRequestId: string;
    requestBody: {
        prompt: string;
        model: GenerateOptions['model'];
        aspectRatio: GenerateOptions['aspectRatio'];
        imageSize: GenerateOptions['imageSize'] | undefined;
        editingInput: GenerateOptions['editingInput'];
        objectImageInputs: GenerateOptions['objectImageInputs'];
        characterImageInputs: GenerateOptions['characterImageInputs'];
        outputFormat: GenerateOptions['outputFormat'];
        temperature: GenerateOptions['temperature'];
        thinkingLevel: GenerateOptions['thinkingLevel'];
        includeThoughts: GenerateOptions['includeThoughts'];
        googleSearch: GenerateOptions['googleSearch'];
        imageSearch: GenerateOptions['imageSearch'];
        safetyThresholds: GenerateOptions['safetyThresholds'];
        executionMode: GenerateOptions['executionMode'];
        conversationContext: GenerateOptions['conversationContext'];
    };
    requestConfig: ReturnType<typeof buildImageRequestConfig>['requestConfig'];
    resolvedResponseModalities: ReturnType<typeof buildImageRequestConfig>['resolvedResponseModalities'];
    groundingMode: ReturnType<typeof buildImageRequestConfig>['groundingMode'];
    effectiveThinkingLevel: ReturnType<typeof buildImageRequestConfig>['effectiveThinkingLevel'];
    shouldIncludeThoughts: ReturnType<typeof buildImageRequestConfig>['shouldIncludeThoughts'];
    parts: Awaited<ReturnType<typeof buildBrowserGenerateParts>>;
    conversationHistoryResult: Awaited<ReturnType<typeof buildBrowserConversationHistory>>;
    useOfficialConversation: boolean;
    ai: GoogleGenAI;
};

type DebugGeminiAuthState = {
    source: 'env' | 'aistudio-intercepted' | 'missing';
    hasVisibleEnvKey: boolean;
    hasAiStudioHost: boolean;
};

type BrowserOnlyTestGenerateImageContext = {
    batchSize: number;
    onImageReceived?:
        | ((
              url: string,
              slotIndex: number,
          ) => Promise<ImageReceivedResult | undefined> | ImageReceivedResult | undefined)
        | undefined;
    onLog?: ((msg: string) => void) | undefined;
    abortSignal?: AbortSignal;
    onProgress?: ((completed: number, total: number) => void) | undefined;
    onResult?: ((result: GenerationResult) => void) | undefined;
    onLiveProgressEvent?: ((event: GenerationLiveProgressEvent) => void) | undefined;
};

type BrowserOnlyTestGeminiServiceOverrides = {
    enhancePromptWithGemini?: (
        currentPrompt: string,
        lang: Language,
        safetyThresholds: Partial<SafetyThresholds>,
    ) => Promise<string> | string;
    generateRandomPrompt?: (lang: Language, safetyThresholds: Partial<SafetyThresholds>) => Promise<string> | string;
    generatePromptFromImage?: (
        imageDataUrl: string,
        lang: Language,
        safetyThresholds: Partial<SafetyThresholds>,
    ) => Promise<string> | string;
    generateImageWithGemini?: (
        options: GenerateOptions,
        context: BrowserOnlyTestGenerateImageContext,
    ) => Promise<GenerationResult[]> | GenerationResult[];
};

const getBrowserOnlyTestGeminiServiceOverrides = (): BrowserOnlyTestGeminiServiceOverrides | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const globalWindow = window as typeof window & {
        __NBU_LITE_TEST_SERVICE_OVERRIDES__?: BrowserOnlyTestGeminiServiceOverrides;
    };

    return globalWindow.__NBU_LITE_TEST_SERVICE_OVERRIDES__ || null;
};

const isTextResultPart = (part: ResultPart): part is ResultTextPart =>
    part.kind === 'thought-text' || part.kind === 'output-text';

const isImageResultPart = (part: ResultPart): part is ResultImagePart =>
    part.kind === 'thought-image' || part.kind === 'output-image';

const isOutputImageResultPart = (part: ResultPart): part is ResultImagePart & { kind: 'output-image' } =>
    part.kind === 'output-image';

const buildResultPartIdentityKey = (part: ResultPart) =>
    isTextResultPart(part)
        ? `${part.kind}:${part.sequence}:${part.text}`
        : `${part.kind}:${part.sequence}:${part.mimeType}:${part.imageUrl}`;

const isThoughtResultPart = (part: ResultPart): boolean =>
    part.kind === 'thought-text' || part.kind === 'thought-image';

const createBrowserLiveProgressAccumulator = (): BrowserLiveProgressAccumulator => ({
    resultParts: [],
    orderingStable: true,
    preCompletionArtifactCount: 0,
    firstPreCompletionArtifactKind: null,
    thoughtSignatureObserved: false,
});

const countSharedPrefix = (left: string[], right: string[]): number => {
    let sharedPrefixLength = 0;

    while (
        sharedPrefixLength < left.length &&
        sharedPrefixLength < right.length &&
        left[sharedPrefixLength] === right[sharedPrefixLength]
    ) {
        sharedPrefixLength += 1;
    }

    return sharedPrefixLength;
};

const resequenceResultParts = (parts: ResultPart[], startingSequence: number): ResultPart[] =>
    parts.map((part, index) => ({
        ...part,
        sequence: startingSequence + index,
    }));

const summarizeResultParts = (parts: ResultPart[]) => {
    const outputTextParts: string[] = [];
    const thoughtTextParts: string[] = [];
    const imageParts = parts.filter(isImageResultPart);
    const outputImageParts = imageParts.filter(isOutputImageResultPart);
    let selectedOutputImage: (ResultImagePart & { kind: 'output-image' }) | undefined;

    outputImageParts.forEach((candidate) => {
        if (!selectedOutputImage || candidate.sequence > selectedOutputImage.sequence) {
            selectedOutputImage = candidate;
        }
    });

    parts.forEach((part) => {
        if (part.kind === 'thought-text') {
            thoughtTextParts.push(part.text.trim());
            return;
        }

        if (part.kind === 'output-text') {
            outputTextParts.push(part.text.trim());
        }
    });

    return {
        imageUrl: selectedOutputImage?.imageUrl,
        imageMimeType: selectedOutputImage?.mimeType,
        text: outputTextParts.filter(Boolean).join('\n\n') || undefined,
        thoughts: thoughtTextParts.filter(Boolean).join('\n\n') || undefined,
        resultParts: parts.length > 0 ? parts : undefined,
        imagePartCount: imageParts.length,
        thoughtImagePartCount: imageParts.filter((part) => part.kind === 'thought-image').length,
        outputImagePartCount: outputImageParts.length,
    };
};

const buildCompletedBrowserStreamExtraction = (
    state: BrowserLiveProgressAccumulator,
    lastChunk: any,
): ReturnType<typeof extractGeneratedContent> => {
    const lastChunkExtracted = lastChunk
        ? extractGeneratedContent(lastChunk)
        : extractGeneratedContent({ candidates: [] } as any);

    if (!state.orderingStable || (state.resultParts.length === 0 && !state.thoughtSignatureObserved)) {
        return lastChunkExtracted;
    }

    const summary = summarizeResultParts(state.resultParts);
    const normalizedCandidateCount = Math.max(
        lastChunkExtracted.candidateCount ?? 0,
        state.resultParts.length > 0 || state.thoughtSignatureObserved ? 1 : 0,
    );
    const normalizedPartCount = Math.max(
        lastChunkExtracted.partCount ?? 0,
        state.resultParts.length + (state.thoughtSignatureObserved ? 1 : 0),
    );
    const extractionIssue =
        normalizedCandidateCount === 0
            ? 'missing-candidates'
            : normalizedPartCount === 0
              ? 'missing-parts'
              : summary.outputImagePartCount === 0
                ? 'no-image-data'
                : undefined;

    return {
        ...lastChunkExtracted,
        imageUrl: summary.imageUrl ?? lastChunkExtracted.imageUrl,
        text: lastChunkExtracted.text ?? summary.text,
        thoughts: lastChunkExtracted.thoughts ?? summary.thoughts,
        resultParts: summary.resultParts ?? lastChunkExtracted.resultParts,
        imageMimeType: summary.imageMimeType ?? lastChunkExtracted.imageMimeType,
        candidateCount: normalizedCandidateCount,
        partCount: normalizedPartCount,
        imagePartCount: Math.max(lastChunkExtracted.imagePartCount ?? 0, summary.imagePartCount),
        thoughtImagePartCount: Math.max(lastChunkExtracted.thoughtImagePartCount ?? 0, summary.thoughtImagePartCount),
        outputImagePartCount: Math.max(lastChunkExtracted.outputImagePartCount ?? 0, summary.outputImagePartCount),
        extractionIssue,
    };
};

const applyBrowserStreamChunkToAccumulator = (
    state: BrowserLiveProgressAccumulator,
    response: any,
): {
    state: BrowserLiveProgressAccumulator;
    newParts: ResultPart[];
    extracted: ReturnType<typeof extractGeneratedContent>;
} => {
    const extracted = extractGeneratedContent(response);
    const currentResultParts = [...(extracted.resultParts || [])].sort((left, right) => left.sequence - right.sequence);
    const currentKeys = currentResultParts.map(buildResultPartIdentityKey);
    const aggregateKeys = state.resultParts.map(buildResultPartIdentityKey);
    const sharedPrefixLength = countSharedPrefix(currentKeys, aggregateKeys);
    let nextState: BrowserLiveProgressAccumulator = {
        ...state,
        thoughtSignatureObserved: state.thoughtSignatureObserved || extracted.thoughtSignaturePresent,
    };
    let newParts: ResultPart[] = [];

    if (currentKeys.length === 0) {
        return { state: nextState, newParts, extracted };
    }

    if (sharedPrefixLength === currentKeys.length && currentKeys.length <= aggregateKeys.length) {
        return { state: nextState, newParts, extracted };
    }

    if (sharedPrefixLength === aggregateKeys.length) {
        newParts = resequenceResultParts(currentResultParts.slice(sharedPrefixLength), state.resultParts.length);
        nextState = {
            ...nextState,
            resultParts: [...state.resultParts, ...newParts],
        };
    } else if (sharedPrefixLength === 0) {
        newParts = resequenceResultParts(currentResultParts, state.resultParts.length);
        nextState = {
            ...nextState,
            resultParts: [...state.resultParts, ...newParts],
        };
    } else {
        nextState = {
            ...nextState,
            orderingStable: false,
        };
        return { state: nextState, newParts: [], extracted };
    }

    const newThoughtParts = newParts.filter((part) => isThoughtResultPart(part));
    if (nextState.orderingStable && newThoughtParts.length > 0) {
        nextState = {
            ...nextState,
            preCompletionArtifactCount: nextState.preCompletionArtifactCount + newThoughtParts.length,
            firstPreCompletionArtifactKind:
                nextState.firstPreCompletionArtifactKind ||
                newThoughtParts[0].kind ||
                nextState.firstPreCompletionArtifactKind,
        };
    }

    return {
        state: nextState,
        newParts,
        extracted,
    };
};

const buildBrowserLiveProgressSummary = (
    state: BrowserLiveProgressAccumulator,
    finalRenderArrived: boolean,
    transportOpened: boolean,
): LiveProgressStreamTruthSummary =>
    summarizeLiveProgressTruthfulness({
        transportOpened,
        orderingStable: state.orderingStable,
        preCompletionArtifactCount: state.preCompletionArtifactCount,
        firstPreCompletionArtifactKind: state.firstPreCompletionArtifactKind,
        thoughtSignatureObserved: state.thoughtSignatureObserved,
        finalRenderArrived,
    });

const mergeResultPartCollections = (
    baseParts: ResultPart[] | undefined,
    accumulatedParts: ResultPart[],
): ResultPart[] | undefined => {
    if (!baseParts?.length && accumulatedParts.length === 0) {
        return undefined;
    }

    const mergedParts = [...(baseParts || [])];
    const seenKeys = new Set(mergedParts.map(buildResultPartIdentityKey));

    accumulatedParts.forEach((part) => {
        const identityKey = buildResultPartIdentityKey(part);
        if (seenKeys.has(identityKey)) {
            return;
        }

        seenKeys.add(identityKey);
        mergedParts.push(part);
    });

    return mergedParts.sort((left, right) => left.sequence - right.sequence);
};

const buildResultPartTextSummary = (
    resultParts: ResultPart[] | undefined,
    kind: Extract<ResultPart['kind'], 'thought-text' | 'output-text'>,
): string | undefined => {
    const summary = (resultParts || [])
        .map((part) => (part.kind === kind ? part.text.trim() : ''))
        .filter(Boolean)
        .join('\n\n');

    return summary || undefined;
};

const mergeAccumulatedStreamPartialResponse = <
    T extends GenerateResponse | GenerationResultPartialResponse | undefined,
>(
    partialResponse: T,
    accumulator: LiveProgressClientAccumulator,
): T => {
    if (accumulator.summary?.orderingStable !== true || accumulator.resultParts.length === 0) {
        return partialResponse;
    }

    const mergedResultParts = mergeResultPartCollections(partialResponse?.resultParts, accumulator.resultParts);
    if (!mergedResultParts?.length) {
        return partialResponse;
    }

    return {
        ...(partialResponse || {}),
        text: partialResponse?.text ?? buildResultPartTextSummary(mergedResultParts, 'output-text'),
        thoughts: partialResponse?.thoughts ?? buildResultPartTextSummary(mergedResultParts, 'thought-text'),
        resultParts: mergedResultParts,
    } as T;
};

const cleanPromptToolResponseText = (text: string | undefined, fallback: string): string =>
    (text?.trim() || fallback).replace(/^["']|["']$/g, '');

const AI_STUDIO_API_UNAVAILABLE_ERROR = 'Gemini API is not available in this AI Studio session.';
const AI_STUDIO_INTERCEPTED_API_KEY = 'AISTUDIO_INTERCEPTED_KEY';

const createDebugRequestId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const resolveGeminiClientAuthState = (): DebugGeminiAuthState => {
    const hasVisibleEnvKey = Boolean(resolveGeminiApiKey());
    const hasAiStudioHost = typeof window !== 'undefined' && Boolean(window.aistudio);

    return {
        source: hasVisibleEnvKey ? 'env' : hasAiStudioHost ? 'aistudio-intercepted' : 'missing',
        hasVisibleEnvKey,
        hasAiStudioHost,
    };
};

const buildGenerationRequestSummary = (options: GenerateOptions, imgIndex: number): string =>
    `Image #${imgIndex}: ${options.model} via ${options.executionMode || 'single-turn'}`;

const buildResponseSummary = (response: GenerateResponse): string =>
    [
        response.imageUrl ? 'image' : null,
        response.text ? 'text' : null,
        response.thoughts ? 'thoughts' : null,
        response.failure?.code ? `failure:${response.failure.code}` : null,
    ]
        .filter(Boolean)
        .join(' | ') || 'no output content';

const buildErrorSummary = (error: unknown): string => {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const failure = getGenerationFailure(normalizedError);

    return failure ? `${normalizedError.message} (${failure.code})` : normalizedError.message;
};

const emitGenerationDebugEvent = ({
    kind,
    label,
    summary,
    payload,
    requestId,
    sessionId,
    slotIndex,
}: {
    kind: 'request' | 'response' | 'error' | 'stream' | 'retry' | 'log';
    label: string;
    summary?: string;
    payload?: unknown;
    requestId?: string;
    sessionId?: string;
    slotIndex?: number;
}) => {
    emitDebugTerminalEvent({
        kind,
        label,
        summary,
        payload,
        requestId,
        sessionId,
        slotIndex,
    });
};

const getGeminiClient = (): GoogleGenAI => {
    let apiKey = resolveGeminiApiKey();
    if (!apiKey) {
        if (typeof window !== 'undefined' && window.aistudio) {
            apiKey = AI_STUDIO_INTERCEPTED_API_KEY;
        } else {
            throw new Error(AI_STUDIO_API_UNAVAILABLE_ERROR);
        }
    }

    return new GoogleGenAI({
        apiKey,
        httpOptions: {
            headers: {
                'User-Agent': 'aistudio-build',
            },
        },
    });
};

const prepareBrowserGenerateRequest = async (
    options: GenerateOptions,
    imgIndex: number,
    onLog?: (msg: string) => void,
    abortSignal?: AbortSignal,
): Promise<PreparedBrowserGenerateRequest> => {
    const debugRequestId = createDebugRequestId();
    const finalPrompt = buildStyleAwareImagePrompt(options);
    const requestBody = {
        prompt: finalPrompt,
        model: options.model,
        aspectRatio: options.aspectRatio,
        imageSize: options.model === 'gemini-2.5-flash-image' ? undefined : options.imageSize,
        editingInput: options.editingInput,
        objectImageInputs: options.objectImageInputs,
        characterImageInputs: options.characterImageInputs,
        outputFormat: options.outputFormat,
        temperature: options.temperature,
        thinkingLevel: options.thinkingLevel,
        includeThoughts: options.includeThoughts,
        googleSearch: options.googleSearch,
        imageSearch: options.imageSearch,
        safetyThresholds: options.safetyThresholds,
        executionMode: options.executionMode,
        conversationContext: options.conversationContext,
    };

    if (abortSignal?.aborted) {
        throw new Error('ABORTED');
    }

    const capabilityError = validateCapabilityRequest(options.model, requestBody);
    if (capabilityError) {
        throw new Error(capabilityError);
    }

    const { requestConfig, resolvedResponseModalities, groundingMode, effectiveThinkingLevel, shouldIncludeThoughts } =
        buildImageRequestConfig(options.model, requestBody);
    const parts = await buildBrowserGenerateParts(requestBody);
    const conversationHistoryResult = await buildBrowserConversationHistory(options.conversationContext);
    const useOfficialConversation =
        options.executionMode === 'chat-continuation' &&
        Boolean(options.conversationContext) &&
        conversationHistoryResult.usable;

    if (options.executionMode === 'chat-continuation' && !conversationHistoryResult.usable) {
        onLog?.(
            `Image #${imgIndex}: Conversation history could not be reconstructed from browser-available assets. Falling back to a single-turn request.`,
        );
    }

    emitGenerationDebugEvent({
        kind: 'request',
        label: `Image #${imgIndex}: Request prepared`,
        summary: buildGenerationRequestSummary(options, imgIndex),
        requestId: debugRequestId,
        payload: {
            requestBody,
            requestConfig,
            resolvedResponseModalities,
            groundingMode,
            effectiveThinkingLevel,
            shouldIncludeThoughts,
            parts,
            conversationHistory: {
                usable: conversationHistoryResult.usable,
                historyLength: conversationHistoryResult.history.length,
            },
            useOfficialConversation,
            auth: resolveGeminiClientAuthState(),
        },
    });

    return {
        debugRequestId,
        requestBody,
        requestConfig,
        resolvedResponseModalities,
        groundingMode,
        effectiveThinkingLevel,
        shouldIncludeThoughts,
        parts,
        conversationHistoryResult,
        useOfficialConversation,
        ai: getGeminiClient(),
    };
};

const buildGenerateResponseFromSdkResponse = async ({
    options,
    prepared,
    sdkResponse,
    extracted,
    imgIndex,
    onLog,
    abortSignal,
}: {
    options: GenerateOptions;
    prepared: PreparedBrowserGenerateRequest;
    sdkResponse: any;
    extracted: ReturnType<typeof extractGeneratedContent>;
    imgIndex: number;
    onLog?: (msg: string) => void;
    abortSignal?: AbortSignal;
}): Promise<GenerateResponse> => {
    throwIfAborted(abortSignal);

    const groundingDetails = extractGroundingDetails(sdkResponse || {});
    const actualOutput = extracted.imageUrl
        ? await loadImageDimensions(extracted.imageUrl)
              .then(({ width, height }) => ({
                  width,
                  height,
                  mimeType: extracted.imageMimeType || 'image/png',
              }))
              .catch(() => null)
        : null;

    throwIfAborted(abortSignal);

    if (!extracted.imageUrl) {
        const failure = resolveGenerationFailureInfo({
            text: extracted.text,
            thoughts: extracted.thoughts,
            promptBlockReason: extracted.promptBlockReason,
            finishReason: extracted.finishReason,
            safetyRatings: extracted.safetyRatings,
            extractionIssue: extracted.extractionIssue,
        });

        throw attachGenerationFailure(new Error(failure.message), failure);
    }

    const response: GenerateResponse = {
        imageUrl: extracted.imageUrl,
        text: extracted.text,
        thoughts: extracted.thoughts,
        resultParts: extracted.resultParts,
        metadata: {
            model: options.model,
            outputFormat: options.outputFormat || 'images-only',
            temperature:
                typeof options.temperature === 'number'
                    ? normalizeTemperature(options.temperature)
                    : DEFAULT_TEMPERATURE,
            thinkingLevel: prepared.effectiveThinkingLevel,
            includeThoughts: prepared.shouldIncludeThoughts,
            requestedAspectRatio: options.aspectRatio || null,
            requestedImageSize: prepared.requestBody.imageSize || null,
            actualOutput,
        },
        grounding: {
            enabled: Boolean(options.googleSearch || options.imageSearch),
            imageSearch: Boolean(options.imageSearch),
            webQueries: groundingDetails.webQueries,
            imageQueries: groundingDetails.imageQueries,
            searchEntryPointAvailable: groundingDetails.searchEntryPointAvailable,
            searchEntryPointRenderedContent: groundingDetails.searchEntryPointRenderedContent,
            supports: groundingDetails.supports,
            sources: groundingDetails.sources,
        },
        sessionHints: {
            googleSearchRequested: Boolean(options.googleSearch),
            imageSearchRequested: Boolean(options.imageSearch),
            outputFormatRequested: options.outputFormat || 'images-only',
            responseModalitiesActual: prepared.resolvedResponseModalities.join('+'),
            thinkingLevelRequested: prepared.effectiveThinkingLevel,
            includeThoughtsRequested: prepared.shouldIncludeThoughts,
            imageSizeRequested: prepared.requestBody.imageSize || null,
            actualImageWidth: actualOutput?.width,
            actualImageHeight: actualOutput?.height,
            actualImageMimeType: actualOutput?.mimeType,
            actualImageDimensions: actualOutput ? `${actualOutput.width}x${actualOutput.height}` : undefined,
            groundingMode: prepared.groundingMode,
            groundingMetadataReturned: Boolean(
                groundingDetails.searchEntryPointAvailable || groundingDetails.sources.length,
            ),
            textReturned: Boolean(extracted.text),
            thoughtsReturned: Boolean(extracted.thoughts),
            thoughtImagesReturned: Boolean(extracted.thoughtImagePartCount),
            resultPartsReturned: extracted.resultParts?.length || 0,
            thoughtSignatureReturned: extracted.thoughtSignaturePresent,
            thoughtSignature: extracted.thoughtSignature,
            sourcesReturned: groundingDetails.sources.length,
            webQueriesReturned: groundingDetails.webQueries.length,
            imageQueriesReturned: groundingDetails.imageQueries.length,
            groundingSupportsReturned: groundingDetails.supports.length,
            officialConversationUsed: prepared.useOfficialConversation,
        },
        conversation: {
            used: prepared.useOfficialConversation,
            conversationId: options.conversationContext?.conversationId,
            branchOriginId: options.conversationContext?.branchOriginId,
            activeSourceHistoryId: options.conversationContext?.activeSourceHistoryId,
            priorTurnCount: options.conversationContext?.priorTurns.length || 0,
            historyLength:
                prepared.conversationHistoryResult.history.length + (prepared.useOfficialConversation ? 2 : 0),
        },
    };

    throwIfAborted(abortSignal);
    onLog?.(`Image #${imgIndex}: Success.`);
    return response;
};

const parseInlineImageFromDataUrl = (imageDataUrl: string): InlinePromptToolImage | null => {
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match?.[2]) {
        return null;
    }

    return {
        mimeType: match[1] || 'image/png',
        data: match[2],
    };
};

const buildLiveProgressEvent = (
    event: GenerationLiveProgressEvent,
    context?: GenerationLiveProgressEventContext,
): GenerationLiveProgressEvent => {
    if (typeof context?.slotIndex !== 'number' && !context?.batchSessionId) {
        return event;
    }

    return {
        ...event,
        ...(typeof context?.slotIndex === 'number' ? { slotIndex: context.slotIndex } : {}),
        ...(context?.batchSessionId ? { batchSessionId: context.batchSessionId } : {}),
    };
};

const delayWithAbort = async (delayMs: number, abortSignal?: AbortSignal): Promise<void> => {
    if (delayMs <= 0) {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(new Error('ABORTED'));
        };
        const timer = setTimeout(() => {
            if (abortSignal) {
                abortSignal.removeEventListener('abort', onAbort);
            }
            resolve();
        }, delayMs);

        if (abortSignal) {
            if (abortSignal.aborted) {
                clearTimeout(timer);
                reject(new Error('ABORTED'));
                return;
            }

            abortSignal.addEventListener('abort', onAbort, { once: true });
        }
    });
};

const isRetryableImageAbsenceFailure = (failure?: GenerateResponse['failure']): boolean =>
    failure?.code === 'no-image-data' || failure?.code === 'text-only';

const isRetryableImageAbsenceMessage = (message?: string): boolean => {
    const normalizedMessage = message?.toLowerCase() || '';
    return normalizedMessage.includes('no image data') || normalizedMessage.includes('text-only');
};

const shouldAttemptImageAbsenceRecovery = (result: GenerationResult): boolean =>
    result.status === 'failed' &&
    (isRetryableImageAbsenceFailure(result.failure) || isRetryableImageAbsenceMessage(result.error));

const buildSuccessGenerationResult = (
    slotIndex: number,
    response: GenerateResponse,
    receivedResult?: ImageReceivedResult,
): GenerationResult => ({
    slotIndex,
    status: 'success',
    url: response.imageUrl,
    displayUrl: receivedResult?.displayUrl || response.imageUrl,
    savedFilename: receivedResult?.savedFilename,
    text: response.text,
    thoughts: response.thoughts,
    resultParts: response.resultParts,
    metadata: response.metadata,
    grounding: response.grounding,
    sessionHints: response.sessionHints,
    conversation: response.conversation,
});

const buildFailedGenerationResult = (
    slotIndex: number,
    error: unknown,
    partialResponse?: GenerationResultPartialResponse,
): GenerationResult => {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const failure = getGenerationFailure(normalizedError);
    const carriedPartialResponse =
        partialResponse ||
        ((normalizedError as Error & { partialResponse?: GenerationResultPartialResponse }).partialResponse ??
            undefined);

    return {
        slotIndex,
        status: 'failed',
        error: normalizedError.message,
        failure: failure || undefined,
        text: carriedPartialResponse?.text,
        thoughts: carriedPartialResponse?.thoughts,
        resultParts: carriedPartialResponse?.resultParts,
        metadata: carriedPartialResponse?.metadata,
        grounding: carriedPartialResponse?.grounding,
        sessionHints: carriedPartialResponse?.sessionHints,
        conversation: carriedPartialResponse?.conversation,
    };
};

const mergeRecoveredFailureResult = (
    initialResult: GenerationResult,
    recoveryResult: GenerationResult,
): GenerationResult => ({
    ...recoveryResult,
    slotIndex: initialResult.slotIndex,
    error: recoveryResult.error || initialResult.error,
    failure: recoveryResult.failure || initialResult.failure,
    text: recoveryResult.text ?? initialResult.text,
    thoughts: recoveryResult.thoughts ?? initialResult.thoughts,
    resultParts:
        recoveryResult.resultParts && recoveryResult.resultParts.length > 0
            ? recoveryResult.resultParts
            : initialResult.resultParts,
    metadata: recoveryResult.metadata ?? initialResult.metadata,
    grounding: recoveryResult.grounding ?? initialResult.grounding,
    sessionHints: recoveryResult.sessionHints ?? initialResult.sessionHints,
    conversation: recoveryResult.conversation ?? initialResult.conversation,
});

const executeBlockingImageAttempt = async (
    options: GenerateOptions,
    slotIndex: number,
    onImageReceived:
        | ((
              url: string,
              slotIndex: number,
          ) => Promise<ImageReceivedResult | undefined> | ImageReceivedResult | undefined)
        | undefined,
    onLog?: (msg: string) => void,
    abortSignal?: AbortSignal,
): Promise<GenerationResult> => {
    try {
        const response = await generateSingleImage(options, slotIndex + 1, onLog, abortSignal);
        if (!response.imageUrl) {
            throw new Error('Model returned no image data.');
        }

        const receivedResult = onImageReceived ? await onImageReceived(response.imageUrl, slotIndex) : undefined;
        return buildSuccessGenerationResult(slotIndex, response, receivedResult);
    } catch (error) {
        if (error instanceof Error && error.message === 'ABORTED') {
            return {
                slotIndex,
                status: 'failed',
                error: 'Generation cancelled',
            };
        }

        return buildFailedGenerationResult(slotIndex, error);
    }
};

const executeBlockingImageAttemptWithTransientRetry = async (
    options: GenerateOptions,
    slotIndex: number,
    onImageReceived:
        | ((
              url: string,
              slotIndex: number,
          ) => Promise<ImageReceivedResult | undefined> | ImageReceivedResult | undefined)
        | undefined,
    onLog?: (msg: string) => void,
    abortSignal?: AbortSignal,
): Promise<GenerationResult> => {
    try {
        const response = await retryOperation(
            () => generateSingleImage(options, slotIndex + 1, onLog, abortSignal),
            3,
            1500,
            { backoffMultiplier: 2, maxDelay: 8000, abortSignal, onLog },
        );

        if (!response.imageUrl) {
            throw new Error('Model returned no image data.');
        }

        const receivedResult = onImageReceived ? await onImageReceived(response.imageUrl, slotIndex) : undefined;
        return buildSuccessGenerationResult(slotIndex, response, receivedResult);
    } catch (error) {
        if (error instanceof Error && error.message === 'ABORTED') {
            return {
                slotIndex,
                status: 'failed',
                error: 'Generation cancelled',
            };
        }

        return buildFailedGenerationResult(slotIndex, error);
    }
};

// Helper to ensure we get the key
export const checkApiKey = async (): Promise<boolean> => {
    return hasConfiguredGeminiApiKey();
};

export const getConfiguredGeminiApiKey = (): string | null => resolveGeminiApiKey();

const generateSingleImageStream = async (
    options: GenerateOptions,
    imgIndex: number = 1,
    onLog?: (msg: string) => void,
    abortSignal?: AbortSignal,
    onLiveProgressEvent?: (event: GenerationLiveProgressEvent) => void,
    eventContext?: GenerationLiveProgressEventContext,
): Promise<StreamGenerationResponse> => {
    let finalResponse: GenerateResponse | null = null;
    let prepared: PreparedBrowserGenerateRequest | null = null;
    let didReceiveStreamEvent = false;
    let transportOpened = false;
    let lastChunk: any = null;
    let streamState = createBrowserLiveProgressAccumulator();
    const streamSessionId = crypto.randomUUID();

    try {
        onLog?.(`Image #${imgIndex}: Opening live progress stream...`);
        prepared = await prepareBrowserGenerateRequest(options, imgIndex, onLog, abortSignal);
        const requestConfig = withAbortSignal(prepared.requestConfig, abortSignal);
        throwIfAborted(abortSignal);
        const stream = prepared.useOfficialConversation
            ? await prepared.ai.chats
                  .create({
                      model: options.model,
                      config: requestConfig,
                      history: prepared.conversationHistoryResult.history,
                  })
                  .sendMessageStream({
                      message: prepared.parts,
                      config: requestConfig,
                  })
            : await prepared.ai.models.generateContentStream({
                  model: options.model,
                  contents: { parts: prepared.parts },
                  config: requestConfig,
              });

        transportOpened = true;
        didReceiveStreamEvent = true;
        emitGenerationDebugEvent({
            kind: 'stream',
            label: `Image #${imgIndex}: Stream opened`,
            summary: prepared.useOfficialConversation ? 'chat.sendMessageStream' : 'models.generateContentStream',
            requestId: prepared.debugRequestId,
            sessionId: streamSessionId,
            slotIndex: eventContext?.slotIndex,
            payload: {
                useOfficialConversation: prepared.useOfficialConversation,
                requestConfig,
            },
        });
        onLiveProgressEvent?.(
            buildLiveProgressEvent(
                {
                    type: 'start',
                    sessionId: streamSessionId,
                },
                eventContext,
            ),
        );

        for await (const chunk of stream) {
            throwIfAborted(abortSignal);
            lastChunk = chunk;

            const applied = applyBrowserStreamChunkToAccumulator(streamState, chunk);
            streamState = applied.state;

            emitGenerationDebugEvent({
                kind: 'stream',
                label: `Image #${imgIndex}: Stream chunk`,
                summary: `${applied.newParts.length} new part(s), ${streamState.resultParts.length} accumulated`,
                requestId: prepared.debugRequestId,
                sessionId: streamSessionId,
                slotIndex: eventContext?.slotIndex,
                payload: {
                    chunk,
                    newParts: applied.newParts,
                    accumulatedResultParts: streamState.resultParts.length,
                    thoughtSignatureObserved: streamState.thoughtSignatureObserved,
                },
            });

            applied.newParts.forEach((part) => {
                onLiveProgressEvent?.(
                    buildLiveProgressEvent(
                        {
                            type: 'result-part',
                            sessionId: streamSessionId,
                            part,
                        },
                        eventContext,
                    ),
                );
            });
        }

        if (!lastChunk && streamState.resultParts.length === 0 && !streamState.thoughtSignatureObserved) {
            throw new Error('Streaming response completed without a final payload.');
        }

        throwIfAborted(abortSignal);

        finalResponse = await buildGenerateResponseFromSdkResponse({
            options,
            prepared,
            sdkResponse: lastChunk || {},
            extracted: buildCompletedBrowserStreamExtraction(streamState, lastChunk),
            imgIndex,
            onLog,
            abortSignal,
        });

        emitGenerationDebugEvent({
            kind: 'response',
            label: `Image #${imgIndex}: Stream completed`,
            summary: buildResponseSummary(finalResponse),
            requestId: prepared.debugRequestId,
            sessionId: streamSessionId,
            slotIndex: eventContext?.slotIndex,
            payload: {
                response: finalResponse,
                transportOpened,
            },
        });

        const summary = buildBrowserLiveProgressSummary(streamState, Boolean(finalResponse.imageUrl), transportOpened);
        onLiveProgressEvent?.(
            buildLiveProgressEvent(
                {
                    type: 'summary',
                    sessionId: streamSessionId,
                    summary,
                },
                eventContext,
            ),
        );
    } catch (error) {
        if (isAbortLikeError(error)) {
            throw new Error('ABORTED');
        }

        const streamError = error as Error & { didReceiveStreamEvent?: boolean; partialResponse?: GenerateResponse };
        const partialResponse = buildCompletedBrowserStreamExtraction(streamState, lastChunk);
        const summary = buildBrowserLiveProgressSummary(streamState, false, transportOpened);
        const partialGroundingDetails = lastChunk ? extractGroundingDetails(lastChunk) : null;

        streamError.didReceiveStreamEvent = didReceiveStreamEvent;
        streamError.partialResponse = mergeAccumulatedStreamPartialResponse(
            {
                ...(streamError.partialResponse || {}),
                text: partialResponse.text,
                thoughts: partialResponse.thoughts,
                resultParts: partialResponse.resultParts,
                grounding: partialGroundingDetails
                    ? {
                          enabled: Boolean(options.googleSearch || options.imageSearch),
                          imageSearch: Boolean(options.imageSearch),
                          webQueries: partialGroundingDetails.webQueries,
                          imageQueries: partialGroundingDetails.imageQueries,
                          searchEntryPointAvailable: partialGroundingDetails.searchEntryPointAvailable,
                          searchEntryPointRenderedContent: partialGroundingDetails.searchEntryPointRenderedContent,
                          supports: partialGroundingDetails.supports,
                          sources: partialGroundingDetails.sources,
                      }
                    : undefined,
            },
            {
                resultParts: streamState.resultParts,
                summary,
            },
        );

        emitGenerationDebugEvent({
            kind: 'error',
            label: `Image #${imgIndex}: Stream failed`,
            summary: buildErrorSummary(streamError),
            requestId: prepared?.debugRequestId,
            sessionId: streamSessionId,
            slotIndex: eventContext?.slotIndex,
            payload: {
                error: streamError,
                failure: getGenerationFailure(streamError),
                didReceiveStreamEvent,
                transportOpened,
                partialResponse: streamError.partialResponse,
            },
        });

        if (transportOpened) {
            onLiveProgressEvent?.(
                buildLiveProgressEvent(
                    {
                        type: 'summary',
                        sessionId: streamSessionId,
                        summary,
                    },
                    eventContext,
                ),
            );
        }

        throw streamError;
    }

    if (!finalResponse) {
        const requestError = new Error('Streaming response completed without a final payload.') as Error & {
            didReceiveStreamEvent?: boolean;
        };
        requestError.didReceiveStreamEvent = didReceiveStreamEvent;
        throw requestError;
    }

    onLog?.(`Image #${imgIndex}: Success.`);

    return {
        response: finalResponse,
        didReceiveStreamEvent,
    };
};

const executeInteractiveStreamSlot = async (
    options: GenerateOptions,
    slotIndex: number,
    onImageReceived:
        | ((
              url: string,
              slotIndex: number,
          ) => Promise<ImageReceivedResult | undefined> | ImageReceivedResult | undefined)
        | undefined,
    onLog?: (msg: string) => void,
    abortSignal?: AbortSignal,
    onLiveProgressEvent?: (event: GenerationLiveProgressEvent) => void,
    eventContext?: GenerationLiveProgressEventContext,
): Promise<GenerationResult> => {
    const executeBlockingStreamFallback = async (): Promise<GenerationResult> => {
        onLog?.(`Image #${slotIndex + 1}: Live progress stream unavailable, falling back to blocking request.`);

        const blockingFallbackResult = await executeBlockingImageAttemptWithTransientRetry(
            options,
            slotIndex,
            onImageReceived,
            onLog,
            abortSignal,
        );

        if (shouldAttemptImageAbsenceRecovery(blockingFallbackResult)) {
            onLog?.(`Image #${slotIndex + 1}: Blocking request returned no final image. Retrying once.`);
            const recoveredResult = await executeBlockingImageAttempt(
                options,
                slotIndex,
                onImageReceived,
                onLog,
                abortSignal,
            );
            return recoveredResult.status === 'success'
                ? recoveredResult
                : mergeRecoveredFailureResult(blockingFallbackResult, recoveredResult);
        }

        return blockingFallbackResult;
    };

    try {
        const streamed = await generateSingleImageStream(
            options,
            slotIndex + 1,
            onLog,
            abortSignal,
            onLiveProgressEvent,
            eventContext,
        );

        if (!streamed.response.imageUrl) {
            throw new Error('Model returned no image data.');
        }

        const receivedResult = onImageReceived
            ? await onImageReceived(streamed.response.imageUrl, slotIndex)
            : undefined;
        return buildSuccessGenerationResult(slotIndex, streamed.response, receivedResult);
    } catch (error: any) {
        if (error.message === 'ABORTED') {
            return {
                slotIndex,
                status: 'failed',
                error: 'Generation cancelled',
            };
        }

        if (!error.didReceiveStreamEvent) {
            return executeBlockingStreamFallback();
        }

        const streamedFailureResult = buildFailedGenerationResult(slotIndex, error);

        if (shouldAttemptImageAbsenceRecovery(streamedFailureResult)) {
            onLog?.(
                `Image #${slotIndex + 1}: Live progress returned no final image. Retrying once with blocking request.`,
            );
            const recoveredResult = await executeBlockingImageAttempt(
                options,
                slotIndex,
                onImageReceived,
                onLog,
                abortSignal,
            );
            return recoveredResult.status === 'success'
                ? recoveredResult
                : mergeRecoveredFailureResult(streamedFailureResult, recoveredResult);
        }

        return streamedFailureResult;
    }
};
export const promptForApiKey = async (): Promise<void> => {
    await promptForGeminiApiKey();
};

// --- Text Utilities (Prompt Engineering) ---

export const enhancePromptWithGemini = async (
    currentPrompt: string,
    lang: Language,
    safetyThresholds: Partial<SafetyThresholds> = DEFAULT_SAFETY_THRESHOLDS,
): Promise<string> => {
    const testOverride = getBrowserOnlyTestGeminiServiceOverrides()?.enhancePromptWithGemini;
    if (testOverride) {
        return await testOverride(currentPrompt, lang, safetyThresholds);
    }

    const normalizedLanguage = normalizePromptToolLanguage(lang);
    const requestId = createDebugRequestId();
    const resolvedSafetySettings = buildSafetySettings(safetyThresholds ?? DEFAULT_SAFETY_THRESHOLDS);
    const requestPayload = {
        model: 'gemini-3.5-flash',
        config: {
            systemInstruction: buildPromptEnhancerInstruction(normalizedLanguage),
            ...(resolvedSafetySettings ? { safetySettings: resolvedSafetySettings } : {}),
            temperature: 0.35,
        },
        contents: `Original prompt to rewrite: "${currentPrompt || 'A creative image'}"`,
    };

    emitGenerationDebugEvent({
        kind: 'request',
        label: 'Prompt enhancer request',
        summary: `Prompt enhancer (${normalizedLanguage})`,
        requestId,
        payload: requestPayload,
    });

    try {
        const response = await getGeminiClient().models.generateContent(requestPayload);
        const promptText = cleanPromptToolResponseText(response.text, '');
        if (!promptText) {
            throw new Error('Prompt enhancement returned empty text.');
        }

        emitGenerationDebugEvent({
            kind: 'response',
            label: 'Prompt enhancer response',
            summary: 'Prompt text generated',
            requestId,
            payload: {
                text: response.text,
                finalPrompt: promptText,
            },
        });

        return promptText;
    } catch (error) {
        emitGenerationDebugEvent({
            kind: 'error',
            label: 'Prompt enhancer failed',
            summary: buildErrorSummary(error),
            requestId,
            payload: { error },
        });
        throw error;
    }
};

export const generateRandomPrompt = async (
    lang: Language,
    safetyThresholds: Partial<SafetyThresholds> = DEFAULT_SAFETY_THRESHOLDS,
): Promise<string> => {
    const testOverride = getBrowserOnlyTestGeminiServiceOverrides()?.generateRandomPrompt;
    if (testOverride) {
        return await testOverride(lang, safetyThresholds);
    }

    const normalizedLanguage = normalizePromptToolLanguage(lang);
    const requestId = createDebugRequestId();
    const resolvedSafetySettings = buildSafetySettings(safetyThresholds ?? DEFAULT_SAFETY_THRESHOLDS);
    const requestPayload = {
        model: 'gemini-3.5-flash',
        config: {
            systemInstruction: buildRandomPromptInstruction(normalizedLanguage),
            ...(resolvedSafetySettings ? { safetySettings: resolvedSafetySettings } : {}),
            temperature: 0.7,
        },
        contents: buildRandomPromptRequest(),
    };

    emitGenerationDebugEvent({
        kind: 'request',
        label: 'Random prompt request',
        summary: `Random prompt (${normalizedLanguage})`,
        requestId,
        payload: requestPayload,
    });

    try {
        const response = await getGeminiClient().models.generateContent(requestPayload);
        const promptText = cleanPromptToolResponseText(response.text, '');
        if (!promptText) {
            throw new Error('Random prompt generation returned empty text.');
        }

        emitGenerationDebugEvent({
            kind: 'response',
            label: 'Random prompt response',
            summary: 'Prompt text generated',
            requestId,
            payload: {
                text: response.text,
                finalPrompt: promptText,
            },
        });

        return promptText;
    } catch (error) {
        emitGenerationDebugEvent({
            kind: 'error',
            label: 'Random prompt failed',
            summary: buildErrorSummary(error),
            requestId,
            payload: { error },
        });
        throw error;
    }
};

export const generatePromptFromImage = async (
    imageDataUrl: string,
    lang: Language,
    safetyThresholds: Partial<SafetyThresholds> = DEFAULT_SAFETY_THRESHOLDS,
): Promise<string> => {
    const testOverride = getBrowserOnlyTestGeminiServiceOverrides()?.generatePromptFromImage;
    if (testOverride) {
        return await testOverride(imageDataUrl, lang, safetyThresholds);
    }

    const normalizedLanguage = normalizePromptToolLanguage(lang);
    const inlineImage = parseInlineImageFromDataUrl(String(imageDataUrl || ''));
    if (!inlineImage || !inlineImage.mimeType.startsWith('image/')) {
        throw new Error('A valid image data URL is required.');
    }
    const requestId = createDebugRequestId();
    const resolvedSafetySettings = buildSafetySettings(safetyThresholds ?? DEFAULT_SAFETY_THRESHOLDS);
    const requestPayload = {
        model: 'gemini-3.5-flash',
        config: {
            systemInstruction: buildImageToPromptInstruction(normalizedLanguage),
            ...(resolvedSafetySettings ? { safetySettings: resolvedSafetySettings } : {}),
            temperature: 0.3,
        },
        contents: [
            { inlineData: inlineImage },
            {
                text: 'Analyze this image carefully and generate a highly detailed, extremely accurate image prompt in the requested language describing it. Focus on absolute forensic precision, documenting every single detail, object, texture, color shade, camera setting, and art medium characteristic without summarization. Output only the prompt itself without any headings, labels, sections, or commentary.',
            },
        ],
    };

    emitGenerationDebugEvent({
        kind: 'request',
        label: 'Image-to-prompt request',
        summary: `Image-to-prompt (${normalizedLanguage})`,
        requestId,
        payload: requestPayload,
    });

    try {
        const response = await getGeminiClient().models.generateContent(requestPayload);
        const promptText = cleanPromptToolResponseText(response.text, '');
        if (!promptText) {
            throw new Error('Image to prompt returned empty text.');
        }

        emitGenerationDebugEvent({
            kind: 'response',
            label: 'Image-to-prompt response',
            summary: 'Prompt text generated',
            requestId,
            payload: {
                text: response.text,
                finalPrompt: promptText,
            },
        });

        return promptText;
    } catch (error) {
        emitGenerationDebugEvent({
            kind: 'error',
            label: 'Image-to-prompt failed',
            summary: buildErrorSummary(error),
            requestId,
            payload: { error },
        });
        throw error;
    }
};

// --- Image Generation Logic ---

const generateSingleImage = async (
    options: GenerateOptions,
    imgIndex: number = 1,
    onLog?: (msg: string) => void,
    abortSignal?: AbortSignal,
): Promise<GenerateResponse> => {
    try {
        onLog?.(`Image #${imgIndex}: Sending request...`);
        const prepared = await prepareBrowserGenerateRequest(options, imgIndex, onLog, abortSignal);
        const requestConfig = withAbortSignal(prepared.requestConfig, abortSignal);
        throwIfAborted(abortSignal);
        const sdkResponse = prepared.useOfficialConversation
            ? await prepared.ai.chats
                  .create({
                      model: options.model,
                      config: requestConfig,
                      history: prepared.conversationHistoryResult.history,
                  })
                  .sendMessage({
                      message: prepared.parts,
                      config: requestConfig,
                  })
            : await prepared.ai.models.generateContent({
                  model: options.model,
                  contents: { parts: prepared.parts },
                  config: requestConfig,
              });

        throwIfAborted(abortSignal);

        const response = await buildGenerateResponseFromSdkResponse({
            options,
            prepared,
            sdkResponse,
            extracted: extractGeneratedContent(sdkResponse),
            imgIndex,
            onLog,
            abortSignal,
        });

        emitGenerationDebugEvent({
            kind: 'response',
            label: `Image #${imgIndex}: Blocking response received`,
            summary: buildResponseSummary(response),
            requestId: prepared.debugRequestId,
            payload: {
                response,
                transport: prepared.useOfficialConversation ? 'chat.sendMessage' : 'models.generateContent',
            },
        });

        return response;
    } catch (error: any) {
        if (isAbortLikeError(error)) {
            const abortError = new Error('ABORTED');
            emitGenerationDebugEvent({
                kind: 'error',
                label: `Image #${imgIndex}: Blocking request aborted`,
                summary: buildErrorSummary(abortError),
                payload: { error: abortError },
            });
            throw abortError;
        }

        const failure = getGenerationFailure(error);
        if (failure) {
            const normalizedFailureError = attachGenerationFailure(new Error(failure.message), failure);
            emitGenerationDebugEvent({
                kind: 'error',
                label: `Image #${imgIndex}: Blocking request failed`,
                summary: buildErrorSummary(normalizedFailureError),
                payload: {
                    error: normalizedFailureError,
                    failure,
                },
            });
            throw normalizedFailureError;
        }

        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('limit: 0')) {
            const quotaError = new Error('Gemini API quota is unavailable for this AI Studio session.');
            emitGenerationDebugEvent({
                kind: 'error',
                label: `Image #${imgIndex}: Blocking request failed`,
                summary: buildErrorSummary(quotaError),
                payload: { error: quotaError },
            });
            throw quotaError;
        }

        const normalizedError = new Error(errorMessage);
        emitGenerationDebugEvent({
            kind: 'error',
            label: `Image #${imgIndex}: Blocking request failed`,
            summary: buildErrorSummary(normalizedError),
            payload: { error: normalizedError },
        });
        throw normalizedError;
    }
};

export type GenerationResult = {
    slotIndex: number;
    status: 'success' | 'failed';
    url?: string;
    displayUrl?: string;
    error?: string;
    failure?: GenerateResponse['failure'];
    savedFilename?: string;
    text?: string;
    thoughts?: string;
    resultParts?: ResultPart[];
    metadata?: Record<string, unknown>;
    grounding?: GenerateResponse['grounding'];
    sessionHints?: GenerateResponse['sessionHints'];
    conversation?: GenerateResponse['conversation'];
};

// F2: Retry helper with exponential backoff
interface RetryOptions {
    backoffMultiplier?: number;
    maxDelay?: number;
    abortSignal?: AbortSignal;
    onLog?: (msg: string) => void;
}
const retryOperation = async <T>(
    operation: () => Promise<T>,
    retries: number,
    delayMs: number = 1500,
    opts?: RetryOptions,
): Promise<T> => {
    const { backoffMultiplier = 2, maxDelay = 8000, abortSignal, onLog } = opts || {};
    try {
        return await operation();
    } catch (error: any) {
        // Never retry these deterministic errors
        const msg = error.message || '';
        if (
            msg.includes('PROMPT_BLOCKED') ||
            msg.includes('SAFETY_BLOCK') ||
            msg.includes('policy') ||
            msg.includes('quota') ||
            msg === 'ABORTED'
        ) {
            throw error;
        }

        if (abortSignal?.aborted) throw new Error('ABORTED');

        if (retries > 0) {
            // Retry transient errors only
            if (
                msg.includes('EMPTY_RESPONSE') ||
                msg.includes('500') ||
                msg.includes('503') ||
                msg.includes('429') ||
                msg.includes('fetch')
            ) {
                // Parse Retry-After header for 429 (rate limit)
                let waitMs = delayMs;
                if (msg.includes('429')) {
                    const retryAfterMatch = msg.match(/retry.?after[:\s]*(\d+)/i);
                    if (retryAfterMatch) waitMs = Math.max(waitMs, parseInt(retryAfterMatch[1]) * 1000);
                }
                onLog?.(`⏳ Retrying in ${(waitMs / 1000).toFixed(1)}s... (${retries} left)`);
                emitGenerationDebugEvent({
                    kind: 'retry',
                    label: 'Retry scheduled',
                    summary: `${msg || 'Transient failure'} -> ${(waitMs / 1000).toFixed(1)}s delay`,
                    payload: {
                        error: error instanceof Error ? error : new Error(String(error)),
                        retriesRemaining: retries,
                        waitMs,
                    },
                });
                // F1-FIX: Use abortable delay so cancel takes effect during retry wait
                await new Promise<void>((resolve, reject) => {
                    const handler = () => {
                        clearTimeout(timer);
                        reject(new Error('ABORTED'));
                    };
                    const timer = setTimeout(() => {
                        if (abortSignal) abortSignal.removeEventListener('abort', handler);
                        resolve();
                    }, waitMs);
                    if (abortSignal) {
                        if (abortSignal.aborted) {
                            clearTimeout(timer);
                            reject(new Error('ABORTED'));
                            return;
                        }
                        abortSignal.addEventListener('abort', handler, { once: true });
                    }
                });
                const nextDelay = Math.min(waitMs * backoffMultiplier, maxDelay);
                return retryOperation(operation, retries - 1, nextDelay, opts);
            }
        }
        throw error;
    }
};

export const generateImageWithGemini = async (
    options: GenerateOptions,
    batchSize: number = 1,
    onImageReceived?:
        | ((
              url: string,
              slotIndex: number,
          ) => Promise<ImageReceivedResult | undefined> | ImageReceivedResult | undefined)
        | undefined,
    onLog?: (msg: string) => void,
    abortSignal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void, // F4: Batch progress
    onResult?: (result: GenerationResult) => void,
    onLiveProgressEvent?: (event: GenerationLiveProgressEvent) => void,
): Promise<GenerationResult[]> => {
    const testOverride = getBrowserOnlyTestGeminiServiceOverrides()?.generateImageWithGemini;
    if (testOverride) {
        const debugRequestId = createDebugRequestId();
        const debugSessionId = options.liveProgressBatchSessionId || undefined;

        emitGenerationDebugEvent({
            kind: 'request',
            label: 'Generation request prepared (test override)',
            summary: `${options.model} test override x${batchSize}`,
            requestId: debugRequestId,
            sessionId: debugSessionId,
            payload: {
                options,
                batchSize,
                source: 'test-override',
            },
        });

        try {
            const results = await testOverride(options, {
                batchSize,
                onImageReceived,
                onLog,
                abortSignal,
                onProgress,
                onResult,
                onLiveProgressEvent,
            });

            results.forEach((result) => {
                emitGenerationDebugEvent({
                    kind: result.status === 'success' ? 'response' : 'error',
                    label:
                        result.status === 'success'
                            ? `Image #${result.slotIndex + 1}: Test override response`
                            : `Image #${result.slotIndex + 1}: Test override failure`,
                    summary:
                        result.status === 'success'
                            ? [
                                  result.url ? 'image' : null,
                                  result.text ? 'text' : null,
                                  result.thoughts ? 'thoughts' : null,
                              ]
                                  .filter(Boolean)
                                  .join(' | ') || 'override success'
                            : result.error || 'override failure',
                    requestId: debugRequestId,
                    sessionId: debugSessionId,
                    slotIndex: result.slotIndex,
                    payload: {
                        result,
                        source: 'test-override',
                    },
                });
            });

            return results;
        } catch (error) {
            emitGenerationDebugEvent({
                kind: 'error',
                label: 'Test override generation failed',
                summary: buildErrorSummary(error),
                requestId: debugRequestId,
                sessionId: debugSessionId,
                payload: {
                    error,
                    source: 'test-override',
                },
            });
            throw error;
        }
    }

    // PARALLEL EXECUTION WITH STAGGER
    const STAGGER_DELAY_MS = 300;
    let completedCount = 0;

    const finalizeBatchResult = (result: GenerationResult): GenerationResult => {
        completedCount++;
        onProgress?.(completedCount, batchSize);
        onResult?.(result);
        return result;
    };

    const promises = Array.from({ length: batchSize }).map(async (_, index): Promise<InitialBatchAttemptOutcome> => {
        // Stagger delay
        if (index > 0) {
            try {
                await delayWithAbort(index * STAGGER_DELAY_MS, abortSignal);
            } catch (error) {
                return {
                    result: finalizeBatchResult({
                        slotIndex: index,
                        status: 'failed',
                        error:
                            error instanceof Error && error.message === 'ABORTED'
                                ? 'Generation cancelled'
                                : String(error),
                    }),
                    needsRecovery: false,
                };
            }
        }

        // F1: Check abort before starting each image
        if (abortSignal?.aborted) {
            return {
                result: finalizeBatchResult({
                    slotIndex: index,
                    status: 'failed',
                    error: 'Generation cancelled',
                }),
                needsRecovery: false,
            };
        }

        const initialResult = await executeBlockingImageAttemptWithTransientRetry(
            options,
            index,
            onImageReceived,
            onLog,
            abortSignal,
        );

        if (initialResult.status === 'success') {
            return {
                result: finalizeBatchResult(initialResult),
                needsRecovery: false,
            };
        }

        if (initialResult.error === 'Generation cancelled') {
            return {
                result: finalizeBatchResult(initialResult),
                needsRecovery: false,
            };
        }

        if (shouldAttemptImageAbsenceRecovery(initialResult)) {
            onLog?.(`Image #${index + 1}: No final image returned. Scheduling one recovery attempt.`);
            return {
                result: initialResult,
                needsRecovery: true,
            };
        }

        onLog?.(`Image #${index + 1} Failed: ${initialResult.error}`);
        return {
            result: finalizeBatchResult(initialResult),
            needsRecovery: false,
        };
    });

    const initialOutcomes = await Promise.all(promises);
    const results = initialOutcomes.map((outcome) => outcome.result);

    for (const outcome of initialOutcomes) {
        if (!outcome.needsRecovery) {
            continue;
        }

        const slotIndex = outcome.result.slotIndex;
        onLog?.(`Image #${slotIndex + 1}: Retrying once after image-absence failure.`);
        const recoveredResult = await executeBlockingImageAttempt(
            options,
            slotIndex,
            onImageReceived,
            onLog,
            abortSignal,
        );
        const finalizedResult =
            recoveredResult.status === 'success'
                ? recoveredResult
                : mergeRecoveredFailureResult(outcome.result, recoveredResult);

        if (finalizedResult.status === 'failed') {
            onLog?.(`Image #${slotIndex + 1} Failed: ${finalizedResult.error}`);
        }

        results[slotIndex] = finalizeBatchResult(finalizedResult);
    }

    return results;
};
