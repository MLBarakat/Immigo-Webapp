import { useEffect, useState } from 'react';
import { logger } from '../logger';

export function DevAsrControls(): JSX.Element | null {
    // Only show in dev builds
    // @ts-ignore
    if (!import.meta.env.DEV) return null;

    // @ts-ignore - window.__ASR is set in the hook
    const initial = (window as any).__ASR ?? {
        partialFlushMs: 200,
        partialWindowS: 1.5,
        partialMinMs: 200,
        partialChunkS: 0.8,
        partialStrideS: 0.2,
    };

    const [partialFlushMs, setPartialFlushMs] = useState<number>(initial.partialFlushMs);
    const [partialWindowS, setPartialWindowS] = useState<number>(initial.partialWindowS);
    const [partialMinMs, setPartialMinMs] = useState<number>(initial.partialMinMs);
    const [partialChunkS, setPartialChunkS] = useState<number>(initial.partialChunkS);
    const [partialStrideS, setPartialStrideS] = useState<number>(initial.partialStrideS);

    useEffect(() => {
        // @ts-ignore
        (window as any).__ASR = { partialFlushMs, partialWindowS, partialMinMs, partialChunkS, partialStrideS };
        // Also inform the worker of the partial chunk/stride config if present
        try {
            // @ts-ignore
            const w = (window as any).__whisperWorker as Worker | undefined;
            if (w && typeof w.postMessage === 'function') {
                w.postMessage({ action: 'set-config', config: { partial_chunk_length_s: partialChunkS, partial_stride_length_s: partialStrideS } });
            }
            logger.info('Dev ASR params updated', { partialFlushMs, partialWindowS, partialMinMs, partialChunkS, partialStrideS });
        } catch (e) {
            logger.warn('Failed to post ASR config to worker', { errorMessage: String(e) });
        }
    }, [partialFlushMs, partialWindowS, partialMinMs, partialChunkS, partialStrideS]);

    return (
        <div className="mt-2 p-2 border rounded bg-immigo-gray-50 text-xs">
            <div className="font-semibold text-sm">Dev ASR Controls</div>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="flex flex-col">
                    <span className="text-xxs">Partial flush ms</span>
                    <input type="number" min={50} value={partialFlushMs} onChange={e => setPartialFlushMs(Number(e.target.value))} className="border px-1" />
                </label>
                <label className="flex flex-col">
                    <span className="text-xxs">Partial window s</span>
                    <input type="number" step="0.1" min={0.5} value={partialWindowS} onChange={e => setPartialWindowS(Number(e.target.value))} className="border px-1" />
                </label>
                <label className="flex flex-col">
                    <span className="text-xxs">Partial min ms</span>
                    <input type="number" min={50} value={partialMinMs} onChange={e => setPartialMinMs(Number(e.target.value))} className="border px-1" />
                </label>
                <label className="flex flex-col">
                    <span className="text-xxs">Partial chunk s</span>
                    <input type="number" step="0.1" min={0.2} value={partialChunkS} onChange={e => setPartialChunkS(Number(e.target.value))} className="border px-1" />
                </label>
                <label className="flex flex-col col-span-2">
                    <span className="text-xxs">Partial stride s</span>
                    <input type="number" step="0.05" min={0.05} value={partialStrideS} onChange={e => setPartialStrideS(Number(e.target.value))} className="border px-1" />
                </label>
            </div>
        </div>
    );
}
