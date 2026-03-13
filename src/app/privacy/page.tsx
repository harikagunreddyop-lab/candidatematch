import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy — CandidateMatch',
    description: 'How CandidateMatch collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-neutral-950 text-white">
            <nav className="bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
                    <a href="/" className="text-xl font-bold bg-gradient-to-r from-brand-400 to-brand-500 bg-clip-text text-transparent">CandidateMatch</a>
                </div>
            </nav>
            <article className="max-w-3xl mx-auto px-6 py-20 prose prose-invert prose-neutral">
                <h1>Privacy Policy</h1>
                <p className="text-neutral-400">Last updated: March 2026</p>

                <h2>1. Information We Collect</h2>
                <p><strong>Account Data:</strong> Name, email, password (hashed). <strong>Profile Data:</strong> Resume text, skills, experience, education, job preferences. <strong>Usage Data:</strong> Pages visited, features used, API calls. <strong>Application Data:</strong> Job matches, ATS scores, resume tailoring history, application outcomes.</p>

                <h2>2. How We Use Your Data</h2>
                <p>We use your data to: (a) provide and improve the Service; (b) match you with relevant jobs; (c) generate and tailor resumes; (d) score your fit against job descriptions; (e) communicate with you about the Service; (f) comply with legal obligations.</p>

                <h2>3. AI Processing</h2>
                <p>We use AI models (including Claude by Anthropic) to: extract job requirements, score candidates, rewrite resume bullets, and generate content. Your data is sent to AI providers solely for Service functionality. We do not sell your data to AI companies for model training.</p>

                <h2>4. Data Sharing</h2>
                <p>We share data with: (a) AI providers for processing (Anthropic); (b) infrastructure providers (Supabase, AWS, Redis); (c) payment processors (Stripe); (d) authorized recruiter or hiring teams (if applicable). We do not sell personal data to third parties.</p>

                <h2>5. Data Retention</h2>
                <p>Account data is retained while your account is active. Upon deletion, personal data is removed within 30 days. Aggregated, anonymized data may be retained for analytics.</p>

                <h2>6. Your Rights</h2>
                <p>You have the right to: (a) access your data; (b) correct inaccurate data; (c) delete your account and data; (d) export your data in a portable format; (e) opt out of non-essential processing. Contact us at <a href="mailto:privacy@candidatematch.io" className="text-blue-400">privacy@candidatematch.io</a>.</p>

                <h2>7. Security</h2>
                <p>We use encryption at rest and in transit, row-level security policies, authenticated API endpoints, and worker authentication. No system is 100% secure, but we implement industry-standard safeguards.</p>

                <h2>8. Cookies</h2>
                <p>We use essential cookies for authentication. We do not use third-party tracking cookies.</p>

                <h2>9. Changes</h2>
                <p>We will notify you of material changes to this policy via email. Continued use after notification constitutes acceptance.</p>
            </article>
        </div>
    );
}
