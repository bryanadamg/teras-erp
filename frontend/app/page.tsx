'use client';

// This route only ever exists for a single tick: MainLayout redirects here to
// /dashboard (logged in) or /login (not) as soon as currentUser resolves. It
// used to fully render DashboardView itself first — a duplicate fetch+mount of
// everything /dashboard renders, thrown away the instant the redirect fires.
export default function RootPage() {
    return null;
}
