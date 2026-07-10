import { Dispatch, MutableRefObject, SetStateAction, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import ComposerSettingsPanel from '../components/ComposerSettingsPanel';
import type { PickerSheet } from '../components/WorkspacePickerSheet';
import { Language } from '../utils/translations';
import {
    AspectRatio,
    GroundingMode,
    ImageModel,
    ImageSize,
    OutputFormat,
    StageAsset,
    StickySendIntent,
    ThinkingLevel,
    TurnLineageAction,
} from '../types';

type ComposerSettingsPanelProps = React.ComponentProps<typeof ComposerSettingsPanel>;

type UseComposerSettingsPanelPropsArgs = {
    prompt: string;
    placeholder: string;
    enterToSubmit: boolean;
    isGenerating: boolean;
    isActionLocked?: boolean;
    isCancelFinalizing?: boolean;
    isEnhancingPrompt: boolean;
    activePromptTool?: ComposerSettingsPanelProps['activePromptTool'];
    currentLanguage: Language;
    imageStyleLabel: string;
    outputFormat: OutputFormat;
    thinkingLevel: ThinkingLevel;
    groundingMode: GroundingMode;
    stickySendIntent: StickySendIntent;
    imageModel: ImageModel;
    aspectRatio: AspectRatio;
    imageSize: ImageSize;
    batchSize: number;
    currentStageAsset: StageAsset | null;
    capability: ComposerSettingsPanelProps['capability'];
    availableGroundingModes: readonly GroundingMode[];
    temperature: number;
    isAdvancedSettingsOpen: boolean;
    generateLabel: string;
    promptTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
    setPrompt: (value: string) => void;
    setStickySendIntent: Dispatch<SetStateAction<StickySendIntent>>;
    toggleEnterToSubmit: () => void;
    handleGenerate: () => void;
    handleCancelGeneration: () => void;
    handleStartNewConversation: () => void;
    handleFollowUpGenerate: () => void;
    handleSurpriseMe: () => void;
    handleSmartRewrite: () => void;
    handleImageToPrompt?: (file: File) => void | Promise<void>;
    openSettings: () => void;
    openAdvancedSettings: () => void;
    setActivePickerSheet: Dispatch<SetStateAction<PickerSheet>>;
    t: (key: string) => string;
    getStageOriginLabel: (origin?: StageAsset['origin']) => string;
    getLineageActionLabel: (action?: TurnLineageAction) => string;
    roundCount: number;
    setRoundCount: (rounds: number) => void;
    autoExportTrigger: 'off' | 'count' | 'size' | 'both';
    setAutoExportTrigger: (trigger: 'off' | 'count' | 'size' | 'both') => void;
    autoExportImageCount: number;
    setAutoExportImageCount: (count: number) => void;
    autoExportFileSizeMb: number;
    setAutoExportFileSizeMb: (size: number) => void;
};

type ComposerSettingsPanelHandlers = {
    setPrompt: (value: string) => void;
    setStickySendIntent: Dispatch<SetStateAction<StickySendIntent>>;
    toggleEnterToSubmit: () => void;
    handleGenerate: () => void;
    handleCancelGeneration: () => void;
    handleStartNewConversation: () => void;
    handleFollowUpGenerate: () => void;
    handleSurpriseMe: () => void;
    handleSmartRewrite: () => void;
    handleImageToPrompt?: (file: File) => void | Promise<void>;
    openSettings: () => void;
    openAdvancedSettings: () => void;
    setActivePickerSheet: Dispatch<SetStateAction<PickerSheet>>;
    setRoundCount: (rounds: number) => void;
    setAutoExportTrigger: (trigger: 'off' | 'count' | 'size' | 'both') => void;
    setAutoExportImageCount: (count: number) => void;
    setAutoExportFileSizeMb: (size: number) => void;
};

export function useComposerSettingsPanelProps({
    prompt,
    placeholder,
    enterToSubmit,
    isGenerating,
    isActionLocked,
    isCancelFinalizing,
    isEnhancingPrompt,
    activePromptTool,
    currentLanguage,
    imageStyleLabel,
    outputFormat,
    thinkingLevel,
    groundingMode,
    stickySendIntent,
    imageModel,
    aspectRatio,
    imageSize,
    batchSize,
    currentStageAsset,
    capability,
    availableGroundingModes,
    temperature,
    isAdvancedSettingsOpen,
    generateLabel,
    promptTextareaRef,
    setPrompt,
    setStickySendIntent,
    toggleEnterToSubmit,
    handleGenerate,
    handleCancelGeneration,
    handleStartNewConversation,
    handleFollowUpGenerate,
    handleSurpriseMe,
    handleSmartRewrite,
    handleImageToPrompt,
    openSettings,
    openAdvancedSettings,
    setActivePickerSheet,
    t,
    getStageOriginLabel,
    getLineageActionLabel,
    roundCount,
    setRoundCount,
    autoExportTrigger,
    setAutoExportTrigger,
    autoExportImageCount,
    setAutoExportImageCount,
    autoExportFileSizeMb,
    setAutoExportFileSizeMb,
}: UseComposerSettingsPanelPropsArgs): ComposerSettingsPanelProps {
    const getModelLabel = useCallback(
        (model: ImageModel) => {
            if (model === 'gemini-3.1-flash-image') {
                return t('modelGemini31Flash');
            }
            if (model === 'gemini-3.1-flash-lite-image') {
                return t('modelGemini31FlashLite');
            }
            if (model === 'gemini-3-pro-image') {
                return t('modelGemini3Pro');
            }
            return t('modelGemini25Flash');
        },
        [t],
    );
    const latestHandlersRef = useRef<ComposerSettingsPanelHandlers>({
        setPrompt,
        setStickySendIntent,
        toggleEnterToSubmit,
        handleGenerate,
        handleCancelGeneration,
        handleStartNewConversation,
        handleFollowUpGenerate,
        handleSurpriseMe,
        handleSmartRewrite,
        handleImageToPrompt,
        openSettings,
        openAdvancedSettings,
        setActivePickerSheet,
        setRoundCount,
        setAutoExportTrigger,
        setAutoExportImageCount,
        setAutoExportFileSizeMb,
    });

    useLayoutEffect(() => {
        latestHandlersRef.current = {
            setPrompt,
            setStickySendIntent,
            toggleEnterToSubmit,
            handleGenerate,
            handleCancelGeneration,
            handleStartNewConversation,
            handleFollowUpGenerate,
            handleSurpriseMe,
            handleSmartRewrite,
            handleImageToPrompt,
            openSettings,
            openAdvancedSettings,
            setActivePickerSheet,
            setRoundCount,
            setAutoExportTrigger,
            setAutoExportImageCount,
            setAutoExportFileSizeMb,
        };
    }, [
        setPrompt,
        setStickySendIntent,
        toggleEnterToSubmit,
        handleGenerate,
        handleCancelGeneration,
        handleStartNewConversation,
        handleFollowUpGenerate,
        handleSurpriseMe,
        handleSmartRewrite,
        handleImageToPrompt,
        openSettings,
        openAdvancedSettings,
        setActivePickerSheet,
        setRoundCount,
        setAutoExportTrigger,
        setAutoExportImageCount,
        setAutoExportFileSizeMb,
    ]);

    return useMemo(
        () => ({
            prompt,
            placeholder,
            enterToSubmit,
            isGenerating,
            isActionLocked,
            isCancelFinalizing,
            isEnhancingPrompt,
            activePromptTool,
            currentLanguage,
            imageStyleLabel,
            outputFormat,
            thinkingLevel,
            groundingMode,
            stickySendIntent,
            currentStageAsset,
            capability,
            availableGroundingModes,
            temperature,
            isAdvancedSettingsOpen,
            generateLabel,
            modelLabel: getModelLabel(imageModel),
            aspectRatio,
            imageSize,
            batchSize,
            promptTextareaRef,
            onPromptChange: (value: string) => latestHandlersRef.current.setPrompt(value),
            onStickySendIntentChange: (value: StickySendIntent) => latestHandlersRef.current.setStickySendIntent(value),
            onToggleEnterToSubmit: () => latestHandlersRef.current.toggleEnterToSubmit(),
            onGenerate: () => latestHandlersRef.current.handleGenerate(),
            onCancelGeneration: () => latestHandlersRef.current.handleCancelGeneration(),
            onStartNewConversation: () => latestHandlersRef.current.handleStartNewConversation(),
            onFollowUpGenerate: () => latestHandlersRef.current.handleFollowUpGenerate(),
            onSurpriseMe: () => latestHandlersRef.current.handleSurpriseMe(),
            onSmartRewrite: () => latestHandlersRef.current.handleSmartRewrite(),
            onImageToPrompt: handleImageToPrompt
                ? (file: File) => latestHandlersRef.current.handleImageToPrompt?.(file)
                : undefined,
            onOpenStyles: () => latestHandlersRef.current.setActivePickerSheet('styles'),
            onOpenSettings: () => latestHandlersRef.current.openSettings(),
            onToggleAdvancedSettings: () => latestHandlersRef.current.openAdvancedSettings(),
            getStageOriginLabel,
            getLineageActionLabel,
            roundCount,
            onRoundCountChange: (rounds: number) => latestHandlersRef.current.setRoundCount(rounds),
            autoExportTrigger,
            onAutoExportTriggerChange: (trigger: 'off' | 'count' | 'size' | 'both') => latestHandlersRef.current.setAutoExportTrigger(trigger),
            autoExportImageCount,
            onAutoExportImageCountChange: (count: number) => latestHandlersRef.current.setAutoExportImageCount(count),
            autoExportFileSizeMb,
            onAutoExportFileSizeMbChange: (size: number) => latestHandlersRef.current.setAutoExportFileSizeMb(size),
        }),
        [
            prompt,
            placeholder,
            enterToSubmit,
            isGenerating,
            isActionLocked,
            isCancelFinalizing,
            isEnhancingPrompt,
            activePromptTool,
            currentLanguage,
            imageStyleLabel,
            outputFormat,
            thinkingLevel,
            groundingMode,
            stickySendIntent,
            imageModel,
            aspectRatio,
            imageSize,
            batchSize,
            currentStageAsset,
            capability,
            availableGroundingModes,
            temperature,
            isAdvancedSettingsOpen,
            generateLabel,
            promptTextareaRef,
            getModelLabel,
            handleImageToPrompt,
            getStageOriginLabel,
            getLineageActionLabel,
            roundCount,
            autoExportTrigger,
            autoExportImageCount,
            autoExportFileSizeMb,
        ],
    );
}
