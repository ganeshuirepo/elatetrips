'use client';

import { Suspense, use } from 'react';
import Link from 'next/link';
import { notFound, useSearchParams } from 'next/navigation';
import { useGetPartnerEoiQuery } from '@/store/elateApi';
import { templateBySlug, templateByType, type VendorTemplate } from '@/components/partner/templates';
import VendorForm from '@/components/partner/VendorForm';
import Card from '@/components/ui/Card';

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[860px] px-6 pt-4 pb-16">
      <Card>
        <div className="flex flex-col items-center gap-3 py-10 text-center">{children}</div>
      </Card>
    </div>
  );
}

/** Loads an existing submission (?ref=…&email=…) and opens it for editing. */
function EditExisting({ template, refId, email }: { template: VendorTemplate; refId: string; email: string }) {
  const { data, isFetching, isError } = useGetPartnerEoiQuery({ referenceId: refId, email });

  if (isFetching) {
    return (
      <Centered>
        <span
          className="h-9 w-9 rounded-full border-[3px] border-[var(--sand)] border-t-[var(--accent)]"
          style={{ animation: 'elspin 0.8s linear infinite' }}
        />
        <p className="text-muted m-0 text-[14px]">Loading your saved details…</p>
      </Centered>
    );
  }
  if (isError || !data) {
    return (
      <Centered>
        <h2 className="text-primary m-0 font-serif text-xl font-bold">Couldn&apos;t load your submission</h2>
        <p className="text-muted m-0 max-w-[46ch] text-[14px]">
          Check that the reference ID and registered email match your original submission.
        </p>
        <Link href="/partner" className="text-accent-ink text-[13.5px] font-bold">
          ← Back to partner tracks
        </Link>
      </Centered>
    );
  }
  // Trust the stored submission's track over the URL segment.
  const actual = templateByType(data.partnerType) ?? template;
  return <VendorForm key={data.referenceId} template={actual} existing={data} ownerEmail={email} />;
}

function PartnerTypeForm({ template }: { template: VendorTemplate }) {
  const search = useSearchParams();
  const refId = search.get('ref')?.trim() ?? '';
  const email = search.get('email')?.trim() ?? '';

  if (refId && email) return <EditExisting template={template} refId={refId} email={email} />;
  return <VendorForm template={template} />;
}

/** One onboarding form per partner track: /partner/hotels, /partner/transport… */
export default function PartnerTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const template = templateBySlug(type);
  if (!template) notFound();

  return (
    <Suspense fallback={null}>
      <PartnerTypeForm template={template} />
    </Suspense>
  );
}
