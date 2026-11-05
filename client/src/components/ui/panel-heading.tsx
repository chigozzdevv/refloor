import { ArrowLeft, X } from 'lucide-react';

export function PanelHeading({
  title,
  back,
  close,
  closeLabel = `Close ${title.toLowerCase()}`,
}: {
  title: string;
  back?: (() => void) | undefined;
  close: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="panel-heading">
      <div className="panel-title">
        {back && (
          <button className="icon-button" aria-label="Back to house chat" onClick={back}>
            <ArrowLeft size={17} />
          </button>
        )}
        <span>{title}</span>
      </div>
      <button className="icon-button" aria-label={closeLabel} onClick={close}>
        <X size={17} />
      </button>
    </div>
  );
}
