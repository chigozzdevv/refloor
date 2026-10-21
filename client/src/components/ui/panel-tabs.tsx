import { useId, useRef, type ReactNode } from 'react';

export function PanelTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  children,
}: {
  label: string;
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  const id = useId(),
    buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <>
      <div className="panel-tabs" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            id={`${id}-tab-${tab.value}`}
            role="tab"
            aria-selected={value === tab.value}
            aria-controls={`${id}-panel`}
            tabIndex={value === tab.value ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              event.stopPropagation();
              onChange(tabs[next]!.value);
              buttons.current[next]?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="panel-tab-content"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${value}`}
      >
        {children}
      </div>
    </>
  );
}
