/**
 * Shared authenticated Supabase client for extension-facing /api/autofill/* routes.
 * Validates the Bearer JWT from the Authorization header and returns
 * a typed auth context, or null if the token is missing / invalid.
 *
 * authedCandidateClient: same but only returns context when user's effective_role is 'candidate'
 * (extension is for candidates only).
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type AutofillAuthContext = {
    supabase: SupabaseClient;
    user: User;
};

export async function authedClient(req: NextRequest): Promise<AutofillAuthContext | null> {
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
    if (!token) return null;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;
    return { supabase, user };
}

/** Returns auth context only when the user has effective_role === 'candidate'. Use for extension-only APIs. */
export async function authedCandidateClient(req: NextRequest): Promise<AutofillAuthContext | null> {
    const ctx = await authedClient(req);
    if (!ctx) return null;

    const { data: profile } = await ctx.supabase
        .from('profile_roles')
        .select('effective_role')
        .eq('id', ctx.user.id)
        .single();

    const role = profile?.effective_role as string | undefined;
    if (role !== 'candidate') return null;
    return ctx;
}
