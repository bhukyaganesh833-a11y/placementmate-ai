// Clearly-labelled SAMPLE listings for local testing. NOT real opportunities
// (example.com links, fictional organizers). Remove before launch.
import { buildStoredDocument, opportunityInputSchema } from '../models/opportunity.js';

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const source = { name: 'Sample data (not real)', url: 'https://example.com/sample' };

const samples = [
  {
    type: 'internship',
    title: '[SAMPLE] Python Backend Intern',
    organization: 'Sample Org Alpha',
    description: 'Sample listing used only for testing the PlacementMate API. Not a real internship.',
    skills: ['Python', 'REST', 'SQL'],
    location: 'Hyderabad',
    workMode: 'hybrid',
    compensation: { kind: 'paid', min: 10000, max: 15000, period: 'month', currency: 'INR' },
    duration: '3 months',
    deadline: inDays(20),
    applyUrl: 'https://example.com/apply/alpha',
    source,
  },
  {
    type: 'internship',
    title: '[SAMPLE] Web Development Intern',
    organization: 'Sample Org Beta',
    description: 'Sample listing used only for testing the PlacementMate API. Not a real internship.',
    skills: ['React', 'JavaScript'],
    workMode: 'remote',
    compensation: { kind: 'unpaid', currency: 'INR' },
    duration: '2 months',
    applyUrl: 'https://example.com/apply/beta',
    source,
  },
  {
    type: 'job',
    title: '[SAMPLE] Junior Java Developer',
    organization: 'Sample Org Gamma',
    description: 'Sample listing used only for testing the PlacementMate API. Not a real job.',
    skills: ['Java', 'Spring Boot'],
    qualification: 'B.Tech / B.E. (CSE/IT)',
    experience: '0-1 years',
    location: 'Bengaluru',
    workMode: 'onsite',
    employmentType: 'full_time',
    deadline: inDays(45),
    applyUrl: 'https://example.com/apply/gamma',
    source,
  },
  {
    type: 'hackathon',
    title: '[SAMPLE] Campus AI Hackathon',
    organization: 'Sample Organizer Delta',
    description: 'Sample listing used only for testing the PlacementMate API. Not a real hackathon.',
    skills: ['Python', 'Machine Learning'],
    workMode: 'remote',
    theme: 'AI for education',
    participation: 'team',
    teamSize: { min: 2, max: 4 },
    registrationStart: inDays(1),
    deadline: inDays(14),
    eventStart: inDays(21),
    eventEnd: inDays(23),
    applyUrl: 'https://example.com/register/delta',
    source,
  },
  {
    type: 'competition',
    title: '[SAMPLE] Inter-College Coding Contest',
    organization: 'Sample Organizer Epsilon',
    description: 'Sample listing used only for testing the PlacementMate API. Not a real contest.',
    skills: ['DSA', 'C++', 'Java'],
    participation: 'individual',
    rules: 'Sample rules text.',
    deadline: inDays(10),
    eventStart: inDays(12),
    applyUrl: 'https://example.com/register/epsilon',
    source,
  },
];


export async function seedSampleOpportunities(repo) {
  const created = [];
  for (const raw of samples) {
    const doc = buildStoredDocument(opportunityInputSchema.parse(raw));
    doc.publicationStatus = 'published'; // sample data only; real listings go through review
    created.push(await repo.create(doc));
  }
  return created;
}
