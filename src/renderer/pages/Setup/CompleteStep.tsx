import React from 'react';
import { Button } from '@/renderer/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import { useTranslation } from 'react-i18next';
import { SetupStepProps } from './index';
import { Check, Rocket, MessageSquare, Sparkles } from 'lucide-react';
import icon from '@/../assets/icon.png';

function CompleteStep({ onNext }: SetupStepProps) {
  const { t } = useTranslation();

  return (
    <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center pb-2 space-y-6">
        {/* Success Animation */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full animate-pulse" />
            <div className="relative w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="w-10 h-10 text-green-500" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <CardTitle className="text-3xl font-bold tracking-tight">
            {t('setup.complete.title')}
          </CardTitle>
          <CardDescription className="text-base max-w-md mx-auto">
            {t('setup.complete.description')}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-8 pt-4">
        {/* Quick Tips */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-center text-muted-foreground">
            {t('setup.complete.quick_tips')}
          </h3>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="w-4 h-4" />
              </div>
              <p className="text-sm">{t('setup.complete.tip_chat')}</p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <Sparkles className="w-4 h-4" />
              </div>
              <p className="text-sm">{t('setup.complete.tip_agents')}</p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <Button
            size="lg"
            onClick={onNext}
            className="w-full max-w-xs gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            <Rocket className="w-4 h-4" />
            {t('setup.complete.start_chatting')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default CompleteStep;

