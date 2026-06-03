import React, { useEffect, useRef, useState } from 'react';
import { loadBrowserSavedImageDataUrl, BROWSER_SAVED_IMAGE_PATH_PREFIX } from '../utils/browserImageStore';
import { buildSavedImageLoadUrl } from '../utils/imageSaveUtils';

type LazyHistoryImageProps = {
    src: string;
    savedFilename?: string;
    alt: string;
    className?: string;
    wrapperClassName?: string;
    placeholderClassName?: string;
    rootMargin?: string;
    dataTestId?: string;
    placeholderTestId?: string;
};

function LazyHistoryImage({
    src,
    savedFilename,
    alt,
    className,
    wrapperClassName,
    placeholderClassName,
    rootMargin = '120px',
    dataTestId,
    placeholderTestId,
}: LazyHistoryImageProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isVisible, setIsVisible] = useState(() => {
        if (typeof window === 'undefined') {
            return true;
        }

        return typeof window.IntersectionObserver === 'undefined';
    });

    const [resolvedSrc, setResolvedSrc] = useState<string>('');

    const isDataUrl = src && src.startsWith('data:');
    const isVirtual = src && src.startsWith(BROWSER_SAVED_IMAGE_PATH_PREFIX);
    const hasFilename = Boolean(savedFilename);
    const isLocalResolutionNeeded = !isDataUrl && (isVirtual || hasFilename);
    const displaySrc = isLocalResolutionNeeded ? resolvedSrc : src;

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
            setIsVisible(true);
            return;
        }

        const node = containerRef.current;
        if (!node) {
            return;
        }

        const observer = new window.IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting || entry.intersectionRatio > 0);
            },
            { rootMargin, threshold: 0.01 },
        );

        observer.observe(node);

        return () => {
            observer.disconnect();
        };
    }, [rootMargin]);

    useEffect(() => {
        if (!isVisible || !isLocalResolutionNeeded) {
            return;
        }

        const filename = savedFilename || (src ? src.slice(BROWSER_SAVED_IMAGE_PATH_PREFIX.length) : undefined);
        if (!filename) {
            setResolvedSrc(src || '');
            return;
        }

        // Check sync cache first
        const syncUrl = buildSavedImageLoadUrl(filename);
        if (syncUrl && syncUrl.startsWith('data:')) {
            setResolvedSrc(syncUrl);
            return;
        }

        let active = true;
        loadBrowserSavedImageDataUrl(filename)
            .then((dataUrl) => {
                if (active && dataUrl) {
                    setResolvedSrc(dataUrl);
                }
            })
            .catch(() => {
                if (active) {
                    setResolvedSrc(src || '');
                }
            });

        return () => {
            active = false;
        };
    }, [isVisible, src, savedFilename, isLocalResolutionNeeded]);

    return (
        <div ref={containerRef} className={wrapperClassName}>
            {isVisible && displaySrc ? (
                <img
                    src={displaySrc || undefined}
                    alt={alt}
                    className={className}
                    data-testid={dataTestId}
                    loading="lazy"
                    decoding="async"
                />
            ) : (
                <div aria-hidden="true" data-testid={placeholderTestId} className={placeholderClassName} />
            )}
        </div>
    );
}

export default React.memo(LazyHistoryImage);
