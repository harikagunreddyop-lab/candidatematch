/**
 * Seed script — populates sample data for development/demo
 * Run: node scripts/seed.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  console.log('🌱 Seeding database...');

  // Sample candidates
  const candidates = [
    {
      full_name: 'Sarah Chen',
      email: 'sarah.chen@example.com',
      phone: '+1 415-555-0101',
      location: 'San Francisco, CA',
      visa_status: 'US Citizen',
      primary_title: 'Senior Software Engineer',
      secondary_titles: ['Full Stack Developer', 'Backend Engineer'],
      skills: ['Python', 'JavaScript', 'React', 'Node.js', 'AWS', 'PostgreSQL', 'Docker', 'Kubernetes', 'GraphQL', 'TypeScript'],
      experience: [
        {
          company: 'TechCorp Inc',
          title: 'Senior Software Engineer',
          start_date: '2021-03',
          end_date: '',
          current: true,
          responsibilities: [
            'Led development of microservices architecture serving 2M+ daily users',
            'Designed and implemented real-time data pipeline processing 500K events/hour',
            'Mentored team of 4 junior developers, improving code review turnaround by 40%',
            'Reduced API latency by 60% through query optimization and caching strategies',
          ],
        },
        {
          company: 'StartupXYZ',
          title: 'Software Engineer',
          start_date: '2018-06',
          end_date: '2021-02',
          current: false,
          responsibilities: [
            'Built full-stack features for SaaS platform using React and Node.js',
            'Implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes',
            'Developed automated testing framework achieving 85% code coverage',
          ],
        },
      ],
      education: [
        { institution: 'Stanford University', degree: 'MS', field: 'Computer Science', graduation_date: '2018-06' },
        { institution: 'UC Berkeley', degree: 'BS', field: 'Computer Science', graduation_date: '2016-05' },
      ],
      certifications: [
        { name: 'AWS Solutions Architect', issuer: 'Amazon', date: '2022-01' },
      ],
      summary: 'Experienced software engineer with 6+ years building scalable distributed systems. Strong in backend architecture, cloud infrastructure, and team leadership.',
      active: true,
    },
    {
      full_name: 'Marcus Johnson',
      email: 'marcus.j@example.com',
      phone: '+1 212-555-0202',
      location: 'New York, NY',
      visa_status: 'US Citizen',
      primary_title: 'Data Scientist',
      secondary_titles: ['Machine Learning Engineer', 'Data Engineer'],
      skills: ['Python', 'TensorFlow', 'PyTorch', 'SQL', 'Spark', 'AWS', 'Scikit-learn', 'Pandas', 'NLP', 'Deep Learning'],
      experience: [
        {
          company: 'DataDriven Co',
          title: 'Senior Data Scientist',
          start_date: '2020-01',
          end_date: '',
          current: true,
          responsibilities: [
            'Developed ML models for customer churn prediction with 92% accuracy',
            'Built recommendation engine increasing user engagement by 35%',
            'Led NLP project for automated support ticket classification',
            'Managed data pipeline processing 10TB of daily user interaction data',
          ],
        },
        {
          company: 'Analytics Corp',
          title: 'Data Scientist',
          start_date: '2017-09',
          end_date: '2019-12',
          current: false,
          responsibilities: [
            'Implemented A/B testing framework for product optimization',
            'Created dashboards and reports for executive decision-making',
            'Developed fraud detection model saving $2M annually',
          ],
        },
      ],
      education: [
        { institution: 'MIT', degree: 'MS', field: 'Statistics', graduation_date: '2017-06' },
      ],
      certifications: [],
      summary: 'Data scientist with expertise in ML, deep learning, and NLP. Track record of building production ML systems.',
      active: true,
    },
    {
      full_name: 'Emily Rodriguez',
      email: 'emily.r@example.com',
      phone: '+1 310-555-0303',
      location: 'Los Angeles, CA',
      visa_status: 'H1B',
      primary_title: 'Product Manager',
      secondary_titles: ['Technical Product Manager', 'Program Manager'],
      skills: ['Product Strategy', 'Agile', 'SQL', 'Jira', 'A/B Testing', 'User Research', 'Roadmapping', 'Stakeholder Management', 'Data Analysis', 'Figma'],
      experience: [
        {
          company: 'ProductFirst Inc',
          title: 'Senior Product Manager',
          start_date: '2019-08',
          end_date: '',
          current: true,
          responsibilities: [
            'Owned product roadmap for platform with $50M ARR',
            'Launched 3 major features driving 25% revenue increase',
            'Led cross-functional team of 12 engineers, designers, and analysts',
            'Conducted user research with 200+ customers per quarter',
          ],
        },
      ],
      education: [
        { institution: 'Wharton School', degree: 'MBA', field: 'Technology Management', graduation_date: '2019-05' },
      ],
      certifications: [
        { name: 'Certified Scrum Product Owner', issuer: 'Scrum Alliance', date: '2020-03' },
      ],
      summary: 'Strategic product manager with a blend of business and technical skills. Passionate about data-driven decision making.',
      active: true,
    },
  ];

  // Insert candidates
  for (const c of candidates) {
    const { data, error } = await supabase.from('candidates').insert(c).select().single();
    if (error) console.error(`❌ Candidate ${c.full_name}:`, error.message);
    else console.log(`✅ Candidate: ${c.full_name}`);
  }

  // Sample jobs
  const jobs = [
    { title: 'Senior Software Engineer', company: 'Google', location: 'Mountain View, CA', jd_clean: 'We are looking for a Senior Software Engineer to join our Cloud team. Requirements: 5+ years experience with Python, Java, or Go. Experience with distributed systems, microservices, and cloud platforms (GCP/AWS). Strong problem-solving skills and ability to mentor junior engineers. Experience with Kubernetes and Docker preferred.' },
    { title: 'Full Stack Developer', company: 'Stripe', location: 'San Francisco, CA', jd_clean: 'Join Stripe as a Full Stack Developer. Build payment infrastructure used by millions. Requirements: Strong JavaScript/TypeScript skills, React experience, Node.js, PostgreSQL. Experience with API design, testing, and CI/CD. Familiarity with financial systems a plus.' },
    { title: 'Data Scientist', company: 'Netflix', location: 'Los Gatos, CA', jd_clean: 'Netflix is hiring a Data Scientist for our Recommendation team. Requirements: MS/PhD in Statistics, Computer Science, or related field. Expertise in Python, TensorFlow or PyTorch. Experience with recommendation systems, NLP, or computer vision. Strong SQL skills and experience with big data tools like Spark.' },
    { title: 'Machine Learning Engineer', company: 'OpenAI', location: 'San Francisco, CA', jd_clean: 'Join OpenAI as an ML Engineer. Build and deploy large-scale ML models. Requirements: Strong Python skills, deep learning frameworks (PyTorch preferred), experience with LLMs and transformer architectures. Understanding of distributed training, RLHF, and evaluation methodologies.' },
    { title: 'Senior Product Manager', company: 'Airbnb', location: 'San Francisco, CA', jd_clean: 'Airbnb seeks a Senior Product Manager for our Search & Discovery team. Requirements: 5+ years product management experience, strong analytical skills, experience with A/B testing and data-driven decision making. Ability to work with engineering and design teams. MBA preferred.' },
    { title: 'Technical Product Manager', company: 'Microsoft', location: 'Redmond, WA', jd_clean: 'Microsoft is hiring a Technical PM for Azure. Requirements: Technical background with coding experience, product management experience, understanding of cloud platforms. Experience with agile methodologies, roadmap planning, and stakeholder management.' },
    { title: 'Backend Engineer', company: 'Shopify', location: 'Remote', jd_clean: 'Shopify is looking for Backend Engineers. Build scalable e-commerce infrastructure. Requirements: Ruby, Python, or Go experience. PostgreSQL, Redis, Kafka. Experience with microservices, API design, and performance optimization. Docker and Kubernetes experience preferred.' },
    { title: 'Software Engineer', company: 'Meta', location: 'Menlo Park, CA', jd_clean: 'Meta is hiring Software Engineers for Instagram. Requirements: Strong coding skills in Python, Java, or C++. Experience with large-scale systems, data structures, and algorithms. Mobile development experience (iOS/Android) a plus. Strong communication skills.' },
  ];

  for (const j of jobs) {
    const hash = crypto.createHash('sha256')
      .update([j.title, j.company, j.location, j.jd_clean.slice(0, 500)].map(s => s.toLowerCase().trim()).join('|'))
      .digest('hex');

    const { error } = await supabase.from('jobs').insert({
      ...j,
      source: 'seed',
      jd_raw: j.jd_clean,
      dedupe_hash: hash,
    });

    if (error) console.error(`❌ Job ${j.title} at ${j.company}:`, error.message);
    else console.log(`✅ Job: ${j.title} at ${j.company}`);
  }

  console.log('\n🎉 Seeding complete!');
  console.log('Next steps:');
  console.log('1. Sign in to the app');
  console.log('2. Set your role to admin: UPDATE profiles SET role = \'admin\' WHERE email = \'your@email.com\';');
  console.log('3. Run matching: POST /api/matches');
}

seed().catch(console.error);
