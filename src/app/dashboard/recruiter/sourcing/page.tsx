import { redirect } from 'next/navigation';

export default function SourcingPage() {
  redirect('/dashboard/recruiter/candidates?view=sourcing');
}
