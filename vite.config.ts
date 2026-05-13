import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '');
    const devPort = Number.parseInt(env.APP_DEV_PORT || process.env.APP_DEV_PORT || '22287', 10);
    const aiStudioGeminiApiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '';

    return {
        define: {
            'process.env.API_KEY': JSON.stringify(aiStudioGeminiApiKey),
            'process.env.GEMINI_API_KEY': JSON.stringify(aiStudioGeminiApiKey),
        },
        server: {
            port: Number.isNaN(devPort) ? 22287 : devPort,
            host: '0.0.0.0',
        },
        plugins: [react()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
        build: {
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (id.includes('/utils/translations/')) {
                            const match = id.match(/\/utils\/translations\/([^/]+)\.ts$/);

                            if (match) {
                                return `workspace-i18n-${match[1]}`;
                            }

                            return 'workspace-i18n';
                        }

                        if (id.includes('/utils/translations.ts')) {
                            return 'workspace-i18n';
                        }

                        if (id.includes('/hooks/')) {
                            return 'workspace-hooks';
                        }

                        if (id.includes('/constants/')) {
                            return 'workspace-constants';
                        }

                        if (id.includes('/utils/')) {
                            return 'workspace-utils';
                        }

                        if (id.includes('node_modules')) {
                            if (id.includes('react') || id.includes('scheduler')) {
                                return 'react-vendor';
                            }

                            return 'vendor';
                        }

                        return undefined;
                    },
                },
            },
        },
    };
});
