import Link from 'next/link';

import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import PageHeader from '@/app/_components/ui/PageHeader';
import CustomerForm from '@/app/_components/admin/CustomerForm';

export const metadata = { title: 'New customer' };

export default async function NewCustomerPage() {
  await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);

  return (
    <>
      <PageHeader
        title="New customer"
        description="Someone who takes fuel on credit and settles up later."
      >
        <Link href="/admin/customers" className="btn-secondary">
          Back to customers
        </Link>
      </PageHeader>

      <div className="max-w-lg">
        <CustomerForm />
      </div>
    </>
  );
}
