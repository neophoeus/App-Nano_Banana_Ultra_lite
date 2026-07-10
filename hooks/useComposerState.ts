import { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react';
import {
    AspectRatio,
    DEFAULT_SAFETY_THRESHOLDS,
    ExecutionMode,
    GenerationSettings,
    GroundingMode,
    ImageModel,
    ImageSize,
    ImageStyle,
    OutputFormat,
    SafetyThresholds,
    StickySendIntent,
    ThinkingLevel,
    ViewerComposerSettingsSnapshot,
    WorkspaceComposerState,
} from '../types';
import { getGroundingFlagsFromMode } from '../utils/groundingMode';
import { normalizeTemperature } from '../utils/temperature';
import { normalizeViewerComposerSettingsSnapshot } from '../utils/viewerComposerSettings';
import { buildDisplaySettingsFromComposerState } from '../utils/workspaceSnapshotState';

type UseComposerStateArgs = {
    initialComposerState: WorkspaceComposerState;
    generationMode: string;
    executionMode: ExecutionMode;
    setGenerationMode: Dispatch<SetStateAction<string>>;
    setExecutionMode: Dispatch<SetStateAction<ExecutionMode>>;
    setDisplaySettings: Dispatch<SetStateAction<GenerationSettings>>;
};

type UseComposerStateReturn = {
    prompt: string;
    setPrompt: Dispatch<SetStateAction<string>>;
    aspectRatio: AspectRatio;
    setAspectRatio: Dispatch<SetStateAction<AspectRatio>>;
    imageSize: ImageSize;
    setImageSize: Dispatch<SetStateAction<ImageSize>>;
    imageStyle: ImageStyle;
    setImageStyle: Dispatch<SetStateAction<ImageStyle>>;
    imageModel: ImageModel;
    setImageModel: Dispatch<SetStateAction<ImageModel>>;
    batchSize: number;
    setBatchSize: Dispatch<SetStateAction<number>>;
    outputFormat: OutputFormat;
    setOutputFormat: Dispatch<SetStateAction<OutputFormat>>;
    temperature: number;
    setTemperature: Dispatch<SetStateAction<number>>;
    thinkingLevel: ThinkingLevel;
    setThinkingLevel: Dispatch<SetStateAction<ThinkingLevel>>;
    includeThoughts: boolean;
    setIncludeThoughts: Dispatch<SetStateAction<boolean>>;
    googleSearch: boolean;
    setGoogleSearch: Dispatch<SetStateAction<boolean>>;
    imageSearch: boolean;
    setImageSearch: Dispatch<SetStateAction<boolean>>;
    safetyThresholds: SafetyThresholds;
    setSafetyThresholds: Dispatch<SetStateAction<SafetyThresholds>>;
    stickySendIntent: StickySendIntent;
    setStickySendIntent: Dispatch<SetStateAction<StickySendIntent>>;
    roundCount: number;
    setRoundCount: Dispatch<SetStateAction<number>>;
    autoExportTrigger: 'off' | 'count' | 'size' | 'both';
    setAutoExportTrigger: Dispatch<SetStateAction<'off' | 'count' | 'size' | 'both'>>;
    autoExportImageCount: number;
    setAutoExportImageCount: Dispatch<SetStateAction<number>>;
    autoExportFileSizeMb: number;
    setAutoExportFileSizeMb: Dispatch<SetStateAction<number>>;
    composerState: WorkspaceComposerState;
    applyComposerState: (nextComposerState: WorkspaceComposerState) => void;
    applyViewerComposerSettingsSnapshot: (snapshot: ViewerComposerSettingsSnapshot) => void;
    setGroundingMode: (mode: GroundingMode) => void;
    restoreEditorComposerState: (
        snapshot: {
            ratio: AspectRatio;
            size: ImageSize;
            batchSize: number;
            model?: ImageModel;
            style?: ImageStyle;
            outputFormat?: OutputFormat;
            temperature?: number;
            thinkingLevel?: ThinkingLevel;
            includeThoughts?: boolean;
            googleSearch?: boolean;
            imageSearch?: boolean;
        } | null,
    ) => void;
};

export function useComposerState({
    initialComposerState,
    generationMode,
    executionMode,
    setGenerationMode,
    setExecutionMode,
    setDisplaySettings,
}: UseComposerStateArgs): UseComposerStateReturn {
    const [prompt, setPrompt] = useState(initialComposerState.prompt);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialComposerState.aspectRatio);
    const [imageSize, setImageSize] = useState<ImageSize>(initialComposerState.imageSize);
    const [imageStyle, setImageStyle] = useState<ImageStyle>(initialComposerState.imageStyle);
    const [imageModel, setImageModel] = useState<ImageModel>(initialComposerState.imageModel);
    const [batchSize, setBatchSize] = useState(initialComposerState.batchSize);
    const [outputFormat, setOutputFormat] = useState<OutputFormat>(initialComposerState.outputFormat);
    const [temperature, setTemperatureState] = useState(normalizeTemperature(initialComposerState.temperature));
    const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(initialComposerState.thinkingLevel);
    const [includeThoughts, setIncludeThoughts] = useState(initialComposerState.includeThoughts);
    const [googleSearch, setGoogleSearch] = useState(initialComposerState.googleSearch);
    const [imageSearch, setImageSearch] = useState(initialComposerState.imageSearch);
    const [safetyThresholds, setSafetyThresholds] = useState<SafetyThresholds>(() => ({
        ...DEFAULT_SAFETY_THRESHOLDS,
        ...(initialComposerState.safetyThresholds || {}),
    }));
    const [stickySendIntent, setStickySendIntent] = useState<StickySendIntent>(
        initialComposerState.stickySendIntent ?? 'independent',
    );
    const [roundCount, setRoundCount] = useState<number>(
        initialComposerState.roundCount ?? 1,
    );
    const [autoExportTrigger, setAutoExportTrigger] = useState<'off' | 'count' | 'size' | 'both'>(
        initialComposerState.autoExportTrigger ?? 'both',
    );
    const [autoExportImageCount, setAutoExportImageCount] = useState<number>(
        initialComposerState.autoExportImageCount ?? 20,
    );
    const [autoExportFileSizeMb, setAutoExportFileSizeMb] = useState<number>(
        initialComposerState.autoExportFileSizeMb ?? 20,
    );

    const setTemperature: Dispatch<SetStateAction<number>> = useCallback((value) => {
        setTemperatureState((previous) => normalizeTemperature(typeof value === 'function' ? value(previous) : value));
    }, []);

    const composerState = useMemo<WorkspaceComposerState>(
        () => ({
            prompt,
            aspectRatio,
            imageSize,
            imageStyle,
            imageModel,
            batchSize,
            outputFormat,
            temperature,
            thinkingLevel,
            includeThoughts,
            googleSearch,
            imageSearch,
            safetyThresholds,
            stickySendIntent,
            generationMode,
            executionMode,
            roundCount,
            autoExportTrigger,
            autoExportImageCount,
            autoExportFileSizeMb,
        }),
        [
            aspectRatio,
            batchSize,
            executionMode,
            generationMode,
            googleSearch,
            imageModel,
            imageSearch,
            imageSize,
            imageStyle,
            includeThoughts,
            safetyThresholds,
            stickySendIntent,
            outputFormat,
            prompt,
            temperature,
            thinkingLevel,
            roundCount,
            autoExportTrigger,
            autoExportImageCount,
            autoExportFileSizeMb,
        ],
    );

    const syncPresentationState = useCallback(
        (nextComposerState: WorkspaceComposerState) => {
            setGenerationMode(nextComposerState.generationMode);
            setExecutionMode(nextComposerState.executionMode);
            setDisplaySettings(buildDisplaySettingsFromComposerState(nextComposerState));
        },
        [setDisplaySettings, setExecutionMode, setGenerationMode],
    );

    const applyComposerState = useCallback(
        (nextComposerState: WorkspaceComposerState) => {
            setPrompt(nextComposerState.prompt);
            setAspectRatio(nextComposerState.aspectRatio);
            setImageSize(nextComposerState.imageSize);
            setImageStyle(nextComposerState.imageStyle);
            setImageModel(nextComposerState.imageModel);
            setBatchSize(nextComposerState.batchSize);
            setOutputFormat(nextComposerState.outputFormat);
            setTemperature(normalizeTemperature(nextComposerState.temperature));
            setThinkingLevel(nextComposerState.thinkingLevel);
            setIncludeThoughts(nextComposerState.includeThoughts);
            setGoogleSearch(nextComposerState.googleSearch);
            setImageSearch(nextComposerState.imageSearch);
            setSafetyThresholds({
                ...DEFAULT_SAFETY_THRESHOLDS,
                ...(nextComposerState.safetyThresholds || {}),
            });
            setStickySendIntent(nextComposerState.stickySendIntent ?? 'independent');
            setRoundCount(nextComposerState.roundCount ?? 1);
            setAutoExportTrigger(nextComposerState.autoExportTrigger ?? 'both');
            setAutoExportImageCount(nextComposerState.autoExportImageCount ?? 20);
            setAutoExportFileSizeMb(nextComposerState.autoExportFileSizeMb ?? 20);
            syncPresentationState(nextComposerState);
        },
        [syncPresentationState],
    );

    const applyViewerComposerSettingsSnapshot = useCallback(
        (snapshot: ViewerComposerSettingsSnapshot) => {
            const normalizedSettings = normalizeViewerComposerSettingsSnapshot(snapshot, composerState.imageSize);
            const nextComposerState: WorkspaceComposerState = {
                ...composerState,
                ...normalizedSettings,
            };

            setAspectRatio(normalizedSettings.aspectRatio);
            setImageSize(normalizedSettings.imageSize);
            setImageStyle(normalizedSettings.imageStyle);
            setImageModel(normalizedSettings.imageModel);
            setBatchSize(normalizedSettings.batchSize);
            setOutputFormat(normalizedSettings.outputFormat);
            setTemperature(normalizedSettings.temperature);
            setThinkingLevel(normalizedSettings.thinkingLevel);
            setIncludeThoughts(normalizedSettings.includeThoughts);
            setGoogleSearch(normalizedSettings.googleSearch);
            setImageSearch(normalizedSettings.imageSearch);
            setDisplaySettings(buildDisplaySettingsFromComposerState(nextComposerState));
        },
        [composerState, setDisplaySettings],
    );

    const setGroundingMode = useCallback((mode: GroundingMode) => {
        const nextFlags = getGroundingFlagsFromMode(mode);
        setGoogleSearch(nextFlags.googleSearch);
        setImageSearch(nextFlags.imageSearch);
    }, []);

    const restoreEditorComposerState = useCallback(
        (
            snapshot: {
                ratio: AspectRatio;
                size: ImageSize;
                batchSize: number;
                model?: ImageModel;
                style?: ImageStyle;
                outputFormat?: OutputFormat;
                temperature?: number;
                thinkingLevel?: ThinkingLevel;
                includeThoughts?: boolean;
                googleSearch?: boolean;
                imageSearch?: boolean;
            } | null,
        ) => {
            if (!snapshot) {
                return;
            }

            setAspectRatio(snapshot.ratio);
            setImageSize(snapshot.size);
            setBatchSize(snapshot.batchSize);

            if (snapshot.model) {
                setImageModel(snapshot.model);
            }
            if (snapshot.style) {
                setImageStyle(snapshot.style);
            }
            if (snapshot.outputFormat) {
                setOutputFormat(snapshot.outputFormat);
            }
            if (typeof snapshot.temperature === 'number') {
                setTemperature(normalizeTemperature(snapshot.temperature));
            }
            if (snapshot.thinkingLevel) {
                setThinkingLevel(snapshot.thinkingLevel);
            }
            if (typeof snapshot.includeThoughts === 'boolean') {
                setIncludeThoughts(snapshot.includeThoughts);
            }
            if (typeof snapshot.googleSearch === 'boolean') {
                setGoogleSearch(snapshot.googleSearch);
            }
            if (typeof snapshot.imageSearch === 'boolean') {
                setImageSearch(snapshot.imageSearch);
            }
        },
        [],
    );

    return {
        prompt,
        setPrompt,
        aspectRatio,
        setAspectRatio,
        imageSize,
        setImageSize,
        imageStyle,
        setImageStyle,
        imageModel,
        setImageModel,
        batchSize,
        setBatchSize,
        outputFormat,
        setOutputFormat,
        temperature,
        setTemperature,
        thinkingLevel,
        setThinkingLevel,
        includeThoughts,
        setIncludeThoughts,
        googleSearch,
        setGoogleSearch,
        imageSearch,
        setImageSearch,
        safetyThresholds,
        setSafetyThresholds,
        stickySendIntent,
        setStickySendIntent,
        roundCount,
        setRoundCount,
        autoExportTrigger,
        setAutoExportTrigger,
        autoExportImageCount,
        setAutoExportImageCount,
        autoExportFileSizeMb,
        setAutoExportFileSizeMb,
        composerState,
        applyComposerState,
        applyViewerComposerSettingsSnapshot,
        setGroundingMode,
        restoreEditorComposerState,
    };
}
