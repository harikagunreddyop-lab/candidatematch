import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service — CandidateMatch',
    description: 'CandidateMatch terms of service and usage agreement.',
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            <nav className="bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
                    <a href="/" className="text-xl font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">CandidateMatch</a>
                </div>
            </nav>
            <article className="max-w-3xl mx-auto px-6 py-20 prose prose-invert prose-neutral">
                <h1>Terms of Service</h1>
                <p className="text-neutral-400">Last updated: March 2026</p>

                <h2>1. Acceptance of Terms</h2>
                <p>By accessing or using CandidateMatch (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>

                <h2>2. Description of Service</h2>
                <p>CandidateMatch is a job execution platform that provides automated job matching, resume tailoring, and application automation. The Service uses AI and automated systems to process your data.</p>

                <h2>3. User Accounts</h2>
                <p>You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>

                <h2>4. Acceptable Use</h2>
                <p>You agree not to: (a) misrepresent your qualifications or experience; (b) use the Service to apply for jobs you are not qualified for at scale; (c) attempt to game or manipulate search results or scoring algorithms; (d) use the Service for any unlawful purpose.</p>

                <h2>5. Intellectual Property</h2>
                <p>You retain ownership of the content you provide. You grant CandidateMatch a license to use, process, and store your data for the purpose of providing the Service.</p>

                <h2>6. Payment Terms</h2>
                <p>Paid subscriptions are billed monthly or annually. You may cancel at any time. Refunds are provided on a case-by-case basis within 14 days of purchase.</p>

                <h2>7. Limitation of Liability</h2>
                <p>CandidateMatch is provided &quot;as is&quot; without warranties of any kind. We do not guarantee job placement, interview invitations, or any specific outcomes. To the maximum extent permitted by law, our total liability is limited to the amount you paid for the Service in the preceding 12 months.</p>

                <h2>8. Termination</h2>
                <p>We may suspend or terminate your account if you violate these terms. You may delete your account at any time, which will trigger deletion of your personal data within 30 days.</p>

                <h2>9. Changes to Terms</h2>
                <p>We may update these terms from time to time. We will notify you of material changes via email or in-app notification.</p>

                <h2>10. Contact</h2>
                <p>For questions about these terms, reach us at <a href="mailto:legal@candidatematch.io" className="text-blue-400">legal@candidatematch.io</a>.</p>
            </article>
        </div>
    );
}
