import i18n from '@/i18n';
import { createContext, ReactNode, useEffect, useMemo, useState } from 'react';

export type EventContextValue = {
  onEvent: (event: string, callback: (...args: any[]) => void) => void;
};

export const EventContext = createContext<EventContextValue>({
  onEvent: (event: string, callback: (...args: any[]) => void) => {},
});

export function EventProvider(props: { children: ReactNode }) {
  const { children } = props;
  const [events, setEvents] = useState<{
    [key: string]: ((...args: any[]) => void)[];
  }>({});
  const onEvent = (event: string, callback: (...args: any[]) => void) => {
    setEvents((prev) => ({
      ...prev,
      [event]: [...(prev[event] || []), callback],
    }));
  };

  return (
    <EventContext.Provider value={{ onEvent }}>
      {children}
    </EventContext.Provider>
  );
}
