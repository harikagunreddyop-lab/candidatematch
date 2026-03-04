import { redirect } from 'next/navigation';

export default function JobBoardsPage() {
  redirect('/dashboard/admin/jobs?tab=boards');
}

