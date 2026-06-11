'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { WizardShell } from '@/components/campaigns/wizard/WizardShell';
import { Step1Goal } from '@/components/campaigns/wizard/Step1Goal';
import { Step2Preview } from '@/components/campaigns/wizard/Step2Preview';
import { Step3Generate } from '@/components/campaigns/wizard/Step3Generate';
import { Step4Refine } from '@/components/campaigns/wizard/Step4Refine';
import { Step5Launch } from '@/components/campaigns/wizard/Step5Launch';
import { Button } from '@/components/ui/button';
import { AiCopilotPanel } from '@/components/ai/AiCopilotPanel';
import { useCampaignWizardStore } from '@/lib/stores/campaignWizardStore';

export default function NewCampaignPage() {
  const step = useCampaignWizardStore((s) => s.step);

  return (
    <div className="relative space-y-6">
      <AiCopilotPanel step={step} />
      <PageHeader
        title="New Campaign"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/campaigns"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
        }
      />
      <WizardShell step={step}>
        {step === 1 && <Step1Goal />}
        {step === 2 && <Step2Preview />}
        {step === 3 && <Step3Generate />}
        {step === 4 && <Step4Refine />}
        {step === 5 && <Step5Launch />}
      </WizardShell>
    </div>
  );
}
