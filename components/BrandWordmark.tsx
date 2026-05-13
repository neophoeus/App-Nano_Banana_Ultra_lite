import React from 'react';

type BrandWordmarkProps = {
    includeBanana?: boolean;
    className?: string;
    mainClassName?: string;
    liteClassName?: string;
};

const joinClassNames = (...values: Array<string | undefined>) => values.filter(Boolean).join(' ');

function BrandWordmark({ includeBanana = false, className, mainClassName, liteClassName }: BrandWordmarkProps) {
    const mainLabel = includeBanana ? '🍌 NANO BANANA ULTRA' : 'NANO BANANA ULTRA';

    return (
        <span
            data-testid="workspace-brand-wordmark"
            className={joinClassNames('inline-flex items-baseline gap-1 whitespace-nowrap', className)}
        >
            <span className={mainClassName}>{mainLabel}</span>
            <span
                data-testid="workspace-brand-lite"
                className={joinClassNames(
                    'font-semibold italic lowercase tracking-normal text-slate-500 dark:text-slate-400',
                    liteClassName,
                )}
            >
                lite
            </span>
        </span>
    );
}

export default React.memo(BrandWordmark);
