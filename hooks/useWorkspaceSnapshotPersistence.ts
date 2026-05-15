import { useCallback, useEffect } from 'react';
import {
    BranchContinuationSourceByOriginId,
    BranchNameOverrides,
    GeneratedImage,
    StageAsset,
    WorkspaceComposerState,
    WorkspaceConversationState,
    WorkspaceSessionState,
} from '../types';
import { sanitizeWorkspaceSnapshot } from '../utils/workspacePersistence';
import { saveWorkspaceSnapshot } from '../utils/workspacePersistence';

type UseWorkspaceSnapshotPersistenceArgs = {
    enabled?: boolean;
    history: GeneratedImage[];
    stagedAssets: StageAsset[];
    workflowLogs: string[];
    workspaceSession: WorkspaceSessionState;
    branchNameOverrides: BranchNameOverrides;
    branchContinuationSourceByBranchOriginId: BranchContinuationSourceByOriginId;
    generatedImageUrls: string[];
    selectedImageIndex: number;
    selectedHistoryId: string | null;
    composerState: WorkspaceComposerState;
    conversationState: WorkspaceConversationState;
};

export function useWorkspaceSnapshotPersistence({
    enabled = false,
    history,
    stagedAssets,
    workflowLogs,
    workspaceSession,
    branchNameOverrides,
    branchContinuationSourceByBranchOriginId,
    generatedImageUrls,
    selectedImageIndex,
    selectedHistoryId,
    composerState,
    conversationState,
}: UseWorkspaceSnapshotPersistenceArgs) {
    const composeCurrentWorkspaceSnapshot = useCallback(
        () =>
            sanitizeWorkspaceSnapshot({
                history,
                stagedAssets,
                workflowLogs,
                workspaceSession,
                branchState: {
                    nameOverrides: branchNameOverrides,
                    continuationSourceByBranchOriginId: branchContinuationSourceByBranchOriginId,
                },
                viewState: {
                    generatedImageUrls,
                    selectedImageIndex,
                    selectedHistoryId,
                },
                composerState,
                conversationState,
            }),
        [
            branchContinuationSourceByBranchOriginId,
            branchNameOverrides,
            composerState,
            conversationState,
            generatedImageUrls,
            history,
            selectedHistoryId,
            selectedImageIndex,
            stagedAssets,
            workflowLogs,
            workspaceSession,
        ],
    );

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const snapshot = composeCurrentWorkspaceSnapshot();
        saveWorkspaceSnapshot(snapshot);
    }, [composeCurrentWorkspaceSnapshot, enabled]);

    return {
        composeCurrentWorkspaceSnapshot,
    };
}
