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
import { Sparkles, MessageSquare, Wrench, Brain } from 'lucide-react';
import icon from '@/../assets/icon.png';

function WelcomeStep({ onNext }: SetupStepProps) {
  const { t } = useTranslation();

  const features = [
    {
      icon: MessageSquare,
      title: t('setup.features.chat'),
      description: t('setup.features.chat_desc'),
    },
    {
      icon: Wrench,
      title: t('setup.features.tools'),
      description: t('setup.features.tools_desc'),
    },
    {
      icon: Brain,
      title: t('setup.features.agents'),
      description: t('setup.features.agents_desc'),
    },
  ];

  return (
    <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-sm">
      <CardHeader className="text-center pb-2 space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
            <img
              src={icon}
              alt="AIME Chat"
              className="relative w-20 h-20 rounded-2xl shadow-lg"
            />
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-3xl font-bold tracking-tight">
            {t('setup.welcome.title')}
          </CardTitle>
          <CardDescription className="text-base max-w-md mx-auto">
            {t('setup.welcome.description')}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-8 pt-4">
        {/* Features Grid */}
        <div className="grid gap-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted/80 transition-colors"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
                <feature.icon className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-medium">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <Button size="lg" onClick={onNext} className="w-full max-w-xs gap-2">
            <Sparkles className="w-4 h-4" />
            {t('setup.welcome.get_started')}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            {t('setup.welcome.setup_time')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default WelcomeStep;

