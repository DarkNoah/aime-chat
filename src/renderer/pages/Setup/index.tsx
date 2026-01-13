import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/renderer/lib/utils';
import { Check } from 'lucide-react';
import WelcomeStep from './WelcomeStep';
import ProviderStep from './ProviderStep';
import ModelStep from './ModelStep';
import RuntimeStep from './RuntimeStep';
import CompleteStep from './CompleteStep';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'react-hot-toast';

export interface SetupStepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

const steps = [
  { id: 'welcome', component: WelcomeStep },
  { id: 'provider', component: ProviderStep },
  { id: 'model', component: ModelStep },
  { id: 'runtime', component: RuntimeStep },
  { id: 'complete', component: CompleteStep },
];

function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Complete setup and navigate to main app
      window.electron.app.completeSetup().then(() => {
        navigate('/chat');
      });
    }
  }, [currentStep, navigate]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-br from-background via-background to-muted/30">
      <Toaster />
      {/* Header with step indicator */}
      <div className="w-full px-8 pt-8">
        <div className="max-w-3xl mx-auto">
          {/* Step Progress */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all duration-300',
                    index < currentStep
                      ? 'bg-primary text-primary-foreground'
                      : index === currentStep
                        ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {index < currentStep ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'w-12 h-1 rounded-full transition-all duration-300',
                      index < currentStep ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <CurrentStepComponent
                onNext={handleNext}
                onBack={currentStep > 0 ? handleBack : undefined}
                onSkip={
                  currentStep > 0 && currentStep < steps.length - 1
                    ? handleSkip
                    : undefined
                }
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default SetupPage;

