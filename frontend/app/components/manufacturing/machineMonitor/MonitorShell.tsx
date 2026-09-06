'use client';

import React from 'react';
import { xpFont, XPActionButton, CardGridSkeleton, SkeletonBar } from '../../shared/xpTheme';
import { ShellWindow, ShellTitleBar } from '../../shared/shellTheme';

/**
 * The window both machine monitors live in: title bar, summary strip, a chip bar
 * pinned above the scroll area, and the scrolling grid.
 *
 * The chip bar sits OUTSIDE the scroll region deliberately — the filter and its
 * alarm badges stay on screen no matter how far down the grid you are.
 */
export const MonitorShell = ({
    classic, icon, title, summary, onRefresh, refreshTitle, loading, hasMachines, chipBar, children,
}: {
    classic: boolean;
    icon: string;
    title: string;
    summary: React.ReactNode;
    onRefresh: () => void;
    refreshTitle: string;
    loading: boolean;
    hasMachines: boolean;
    chipBar: React.ReactNode;
    children: React.ReactNode;
}) => (
    <div className="fade-in" style={classic ? { fontFamily: xpFont } : undefined}>
        <ShellWindow classic={classic} fill="page">
            <ShellTitleBar
                classic={classic}
                icon={icon}
                title={title}
                right={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 'normal', fontSize: classic ? 11 : 12 }}>
                        <span className={classic ? undefined : 'text-muted'}>{summary}</span>
                        <XPActionButton classic={classic} tone="neutral" icon="bi-arrow-clockwise"
                            title={refreshTitle} onClick={onRefresh} />
                    </span>
                }
            />
            {(loading || hasMachines) && (
                <div style={{ padding: classic ? '6px 8px 0' : '12px 12px 0', background: classic ? '#ece9d8' : undefined }}>
                    {/* Placeholder chips hold the strip's height while loading — without
                        them the whole grid jumps down when the real chip bar appears. */}
                    {loading
                        ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[70, 96, 84, 110].map((w, i) => (
                                <SkeletonBar key={i} width={w} height={classic ? 17 : 24} />
                            ))}
                        </div>
                        : chipBar}
                </div>
            )}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: classic ? 8 : 12, background: classic ? '#ece9d8' : undefined }}>
                {children}
            </div>
        </ShellWindow>
    </div>
);

/**
 * Loading state for the grid. Geometry mirrors `gridColumns`/`MachineCard` so the
 * real grid drops straight into the skeleton's tracks with no shift — a body deep
 * enough for the run readout plus whatever the domain hangs under it.
 */
export const MonitorGridSkeleton = ({ classic, bodyHeight }: { classic: boolean; bodyHeight?: number }) => (
    <CardGridSkeleton
        count={12}
        minWidth={classic ? 240 : 250}
        gap={classic ? 8 : 12}
        classic={classic}
        bodyLines={3}
        bodyHeight={bodyHeight ?? (classic ? 96 : 118)}
    />
);
