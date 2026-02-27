'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';

/**
 * /connect-extension
 *
 * How token transfer works (no extension ID required):
 * 1. This page retrieves the Supabase session JWT.
 * 2. It renders the token in a hidden <div id="cm-ext-token"> element.
 * 3. The CandidateMatch content script (running on this page) detects that element,
 *    sends the token to background.ts via chrome.runtime.sendMessage,
 *    and dispatches a CustomEvent 'cm:connected' when done.
 * 4. This page listens for 'cm:connected' and shows the success state.
 * 5. Fallback: if the extension is not installed, the user sees a manual copy token UI.
 */

type Status = 'loading' | 'no-session' | 'waiting' | 'connected' | 'expired' | 'no-extension';

export default function ConnectExtensionPage() {
    const supabase = createClient();
    const [status, setStatus] = useState<Status>('loading');
    const [token, setToken] = useState('');
    const [expiry, setExpiry] = useState(0);
    const [minutesLeft, setMinutesLeft] = useState(0);
    const [copied, setCopied] = useState(false);
    const tokenElRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { setStatus('no-session'); return; }

            const expiryMs = session.expires_at! * 1000;
            setToken(session.access_token);
            setExpiry(expiryMs);
            setMinutesLeft(Math.round((expiryMs - Date.now()) / 60_000));
            setStatus('waiting');
        })();
    }, [supabase]);

    // Count down minutes left
    useEffect(() => {
        if (status !== 'waiting' && status !== 'connected') return;
        const id = setInterval(() => {
            setMinutesLeft(prev => {
                if (prev <= 1) { setStatus('expired'); clearInterval(id); return 0; }
                return prev - 1;
            });
        }, 60_000);
        return () => clearInterval(id);
    }, [status]);

    // Listen for cm:connected event from the content script
    useEffect(() => {
        const handler = () => setStatus('connected');
        document.addEventListener('cm:connected', handler);

        // Give content script 3s to pick up the token before showing the "no extension" fallback
        const timer = setTimeout(() => {
            if (status === 'waiting') setStatus('no-extension');
        }, 3000);

        return () => {
            document.removeEventListener('cm:connected', handler);
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    const handleCopyToken = () => {
        navigator.clipboard.writeText(token).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleRefresh = async () => {
        setStatus('loading');
        const { data: { session }, error } = await supabase.auth.refreshSession();
        if (error || !session) { setStatus('no-session'); return; }
        const expiryMs = session.expires_at! * 1000;
        setToken(session.access_token);
        setExpiry(expiryMs);
        setMinutesLeft(Math.round((expiryMs - Date.now()) / 60_000));
        setStatus('waiting');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] px-4">
            {/* Hidden token element — content script reads this */}
            {token && (
                <div
                    ref={tokenElRef}
                    id="cm-ext-token"
                    hidden
                    data-token={token}
                    data-expiry={String(expiry)}
                    data-base-url={typeof window !== 'undefined' ? window.location.origin : ''}
                />
            )}

            <div className="w-full max-w-md">
                {/* Logo + title */}
                <div className="text-center mb-8">
                    <div className="text-5xl mb-3">🤖</div>
                    <h1 className="text-2xl font-bold text-white">Connect Extension</h1>
                    <p className="text-[#888] text-sm mt-1">Link your CandidateMatch account to the autofill extension</p>
                </div>

                <div className="bg-[#1a1a2e] border border-[#2a2a4c] rounded-2xl p-6 space-y-6">

                    {/* ── Loading ── */}
                    {status === 'loading' && (
                        <div className="text-center text-[#888] py-4">
                            <div className="animate-spin text-2xl mb-2">⟳</div>
                            Checking session…
                        </div>
                    )}

                    {/* ── No session ── */}
                    {status === 'no-session' && (
                        <div className="text-center">
                            <div className="text-amber-400 text-lg mb-3">⚠ Not signed in</div>
                            <p className="text-[#aaa] text-sm mb-4">Please sign in to CandidateMatch first, then return here.</p>
                            <a href="/auth/login" className="inline-block px-5 py-2.5 bg-[#7c83fd] text-white rounded-xl text-sm font-semibold hover:opacity-85 transition-opacity">
                                Sign In
                            </a>
                        </div>
                    )}

                    {/* ── Waiting for extension to pick up token ── */}
                    {status === 'waiting' && (
                        <div className="text-center py-2">
                            <div className="text-4xl mb-3 animate-pulse">🔗</div>
                            <p className="text-white font-semibold">Connecting to extension…</p>
                            <p className="text-[#888] text-sm mt-1">Make sure the extension is installed in Chrome.</p>
                        </div>
                    )}

                    {/* ── Connected ── */}
                    {status === 'connected' && (
                        <div className="text-center py-2">
                            <div className="text-5xl mb-3">✅</div>
                            <p className="text-emerald-400 font-bold text-lg">Extension connected!</p>
                            <p className="text-[#888] text-sm mt-1">
                                Session valid for ~{minutesLeft} min. Press <kbd className="bg-[#2a2a4c] text-[#7c83fd] px-1.5 py-0.5 rounded text-xs">Ctrl+Shift+F</kbd> on any job page to autofill.
                            </p>
                            <p className="text-[#555] text-xs mt-4">
                                When the session expires, come back here to reconnect.
                            </p>
                        </div>
                    )}

                    {/* ── Expired ── */}
                    {status === 'expired' && (
                        <div className="text-center py-2">
                            <div className="text-4xl mb-3">⏰</div>
                            <p className="text-amber-400 font-semibold">Session expired</p>
                            <p className="text-[#888] text-sm mt-1 mb-4">Refresh to generate a new token.</p>
                            <button
                                onClick={handleRefresh}
                                className="px-5 py-2.5 bg-[#7c83fd] text-white rounded-xl text-sm font-semibold hover:opacity-85 transition-opacity"
                            >
                                Refresh Session
                            </button>
                        </div>
                    )}

                    {/* ── Extension not detected (fallback: manual copy) ── */}
                    {status === 'no-extension' && (
                        <>
                            <div className="text-center">
                                <div className="text-4xl mb-3">⬇️</div>
                                <p className="text-white font-semibold">Extension not detected</p>
                                <p className="text-[#888] text-sm mt-1">
                                    Install the CandidateMatch extension, reload this page, and try again.
                                    Or copy the token below and paste it into the extension popup manually.
                                </p>
                            </div>

                            {/* Manual token copy */}
                            <div>
                                <p className="text-xs text-[#888] uppercase tracking-wide font-semibold mb-2">
                                    Manual token ({minutesLeft} min remaining)
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        readOnly
                                        value={token}
                                        type="password"
                                        className="flex-1 bg-[#0f0f1a] border border-[#2a2a4c] rounded-xl px-3 py-2 text-xs text-[#7c83fd] font-mono"
                                    />
                                    <button
                                        onClick={handleCopyToken}
                                        className="px-3 py-2 bg-[#2a2a4c] text-white rounded-xl text-sm hover:bg-[#3a3a5c] transition-colors"
                                    >
                                        {copied ? '✓' : '📋'}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => { setStatus('loading'); handleRefresh(); }}
                                className="w-full px-4 py-2.5 bg-[#7c83fd] text-white rounded-xl text-sm font-semibold hover:opacity-85 transition-opacity"
                            >
                                Reload &amp; Try Again
                            </button>
                        </>
                    )}

                    {/* ── How it works ── */}
                    {(status === 'waiting' || status === 'connected' || status === 'no-extension') && (
                        <div className="border-t border-[#2a2a4c] pt-4">
                            <p className="text-xs text-[#555] font-semibold uppercase tracking-wide mb-3">How it works</p>
                            <ol className="space-y-2 text-xs text-[#888]">
                                <li className="flex gap-2"><span className="text-[#7c83fd] font-bold">1.</span> Open any job application in Chrome</li>
                                <li className="flex gap-2"><span className="text-[#7c83fd] font-bold">2.</span> Press <kbd className="bg-[#2a2a4c] text-[#7c83fd] px-1 rounded">Ctrl+Shift+F</kbd> (Mac: <kbd className="bg-[#2a2a4c] text-[#7c83fd] px-1 rounded">⌘⇧F</kbd>)</li>
                                <li className="flex gap-2"><span className="text-[#7c83fd] font-bold">3.</span> Fields fill instantly from your CandidateMatch profile</li>
                                <li className="flex gap-2"><span className="text-[#7c83fd] font-bold">4.</span> Review highlighted fields, then submit manually</li>
                            </ol>
                        </div>
                    )}

                    {/* Security note */}
                    <div className="bg-[#0f0f1a] border border-[#2a2a4c] rounded-xl p-3">
                        <p className="text-[#555] text-xs">
                            🔒 <strong className="text-[#777]">Security:</strong> Only a short-lived session token is stored locally in the extension.
                            No passwords are ever stored. The extension never submits forms automatically.
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}
