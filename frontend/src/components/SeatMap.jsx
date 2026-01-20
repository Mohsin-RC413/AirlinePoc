import { useMemo, useState } from 'react';

import './SeatMap.css';

const STATUS_LABELS = {
  available: 'Available',
  selected: 'Selected',
  booked: 'Booked',
  held: 'Held',
  pending: 'Pending confirmation',
};

const LEGEND_ITEMS = [
  { key: 'premium', label: 'Premium' },
  { key: 'legroom', label: 'Extra legroom' },
  { key: 'front', label: 'Front seats' },
  { key: 'standard', label: 'Available - stay with family' },
];

const formatSeatTooltip = (seat, isSelected) => {
  const label = STATUS_LABELS[seat.status] ?? seat.status;
  const traits = [];
  if (seat.type === 'window') {
    traits.push('Window');
  } else if (seat.type === 'aisle') {
    traits.push('Aisle');
  } else if (seat.type === 'middle') {
    traits.push('Middle');
  }
  if (seat.extra?.legroom) {
    traits.push('Extra legroom');
  }
  if (seat.extra?.exitRow) {
    traits.push('Exit row');
  }
  const details = [label, ...traits];
  if (isSelected) {
    details.unshift('Selected seat');
  }
  return `${seat.id}${details.length ? ` - ${details.join(' - ')}` : ''}`;
};

const buildLegend = (sections) => {
  if (!sections.length) {
    return [];
  }
  const hasUnavailable = sections.some((section) =>
    section.rows.some((row) =>
      row.seats.some((seat) => seat.status !== 'available'),
    ),
  );
  const items = [...LEGEND_ITEMS];
  if (hasUnavailable) {
    items.push({ key: 'unavailable', label: 'Unavailable' });
  }
  return items;
};

const parseRowNumber = (value) => {
  const match = String(value ?? '').match(/^\d+/);
  if (!match) {
    return null;
  }
  return Number(match[0]);
};

const getSeatTier = (seat, rowNumber) => {
  const numericRow =
    Number.isFinite(rowNumber) && rowNumber > 0
      ? rowNumber
      : parseRowNumber(seat.id);

  if (seat.extra?.legroom && numericRow === 1) {
    return 'premium';
  }
  if (seat.extra?.legroom || seat.extra?.exitRow) {
    return 'legroom';
  }
  if (Number.isFinite(numericRow) && numericRow <= 4) {
    return 'front';
  }
  return 'standard';
};

const splitRowSeats = (seats) => {
  const midpoint = Math.floor(seats.length / 2);
  return {
    left: seats.slice(0, midpoint),
    right: seats.slice(midpoint),
  };
};

const cx = (...input) => {
  const classes = [];
  input.forEach((value) => {
    if (!value) {
      return;
    }
    if (typeof value === 'string') {
      classes.push(value);
    } else if (Array.isArray(value)) {
      const nested = cx(...value);
      if (nested) {
        classes.push(nested);
      }
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([key, condition]) => {
        if (condition) {
          classes.push(key);
        }
      });
    }
  });
  return classes.join(' ');
};

const SeatLegend = ({ sections }) => {
  const legend = useMemo(() => buildLegend(sections), [sections]);

  if (!legend.length) {
    return null;
  }

  return (
    <div className="seat-map__legend">
      {legend.map((item) => (
        <span
          key={item.key}
          className={cx('seat-map__legend-item', `seat-map__legend-item--${item.key}`)}
        >
          <span className="seat-map__legend-swatch" aria-hidden />
          <span className="seat-map__legend-label">{item.label}</span>
        </span>
      ))}
    </div>
  );
};

const SeatConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  selectedSeatIds,
  isSyncing,
}) => {
  if (!open) {
    return null;
  }
  return (
    <div className="seat-map__dialog-backdrop" role="presentation">
      <div
        className="seat-map__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seat-map-confirmation-title"
      >
        <h4 id="seat-map-confirmation-title">Confirm seats</h4>
        <p className="seat-map__dialog-subtitle">
          Please verify your selection before saving.
        </p>
        <div className="seat-map__dialog-selection">
          {selectedSeatIds.length ? (
            <ul>
              {selectedSeatIds.map((seatId) => (
                <li key={seatId}>{seatId}</li>
              ))}
            </ul>
          ) : (
            <p>No seats selected yet.</p>
          )}
        </div>
        <div className="seat-map__dialog-actions">
          <button
            type="button"
            className="seat-map__dialog-button seat-map__dialog-button--secondary"
            onClick={onClose}
            disabled={isSyncing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="seat-map__dialog-button seat-map__dialog-button--primary"
            onClick={() => onConfirm(selectedSeatIds)}
            disabled={!selectedSeatIds.length || isSyncing}
          >
            {isSyncing ? 'Saving...' : 'Confirm seats'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SeatMap = ({
  seatMap,
  selectedSeats = [],
  onSeatToggle,
  onConfirmSelection,
  isSyncing = false,
  syncError = '',
}) => {
  const [showDialog, setShowDialog] = useState(false);
  const selectedSeatIds = useMemo(
    () => new Set((selectedSeats ?? []).map((seat) => seat.toUpperCase())),
    [selectedSeats],
  );
  const sections = seatMap?.sections ?? [];

  const handleSeatClick = (seat) => {
    if (isSyncing || !onSeatToggle) {
      return;
    }
    const normalized = seat.id.toUpperCase();
    if (seat.status !== 'available' && !selectedSeatIds.has(normalized)) {
      return;
    }
    onSeatToggle(normalized, seat);
  };

  const handleConfirm = () => {
    if (!onConfirmSelection) {
      return;
    }
    setShowDialog(true);
  };

  const handleConfirmDialog = (seatIds) => {
    onConfirmSelection(seatIds);
    setShowDialog(false);
  };

  const sortedSelected = useMemo(
    () => Array.from(selectedSeatIds.values()).sort(),
    [selectedSeatIds],
  );

  const renderSeatButton = (seat, rowNumber) => {
    const normalized = seat.id.toUpperCase();
    const isSelected = selectedSeatIds.has(normalized);
    const isUnavailable = seat.status !== 'available' && !isSelected;
    const tier = getSeatTier(seat, rowNumber);

    return (
      <button
        key={seat.id}
        type="button"
        className={cx(
          'seat-map__seat',
          `seat-map__seat--${seat.status}`,
          `seat-map__seat--tier-${tier}`,
          {
            'seat-map__seat--selected': isSelected,
            'seat-map__seat--syncing': isSyncing && isSelected,
            'seat-map__seat--unavailable': isUnavailable,
          },
        )}
        onClick={() => handleSeatClick(seat)}
        disabled={isUnavailable || isSyncing}
        data-tooltip={formatSeatTooltip(seat, isSelected)}
        aria-pressed={isSelected}
        aria-label={formatSeatTooltip(seat, isSelected)}
      >
        <span>{seat.display ?? seat.id}</span>
      </button>
    );
  };

  return (
    <div className="seat-map">
      {syncError ? (
        <div className="seat-map__error" role="status">
          {syncError}
        </div>
      ) : null}

      <div className="seat-map__plane">
        <svg
          className="seat-map__plane-illustration"
          viewBox="0 0 400 900"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <g fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2">
            <path d="M200 30 C280 30 350 110 350 190 L350 720 C350 810 280 870 200 870 C120 870 50 810 50 720 L50 190 C50 110 120 30 200 30 Z" />
          </g>
          <g fill="#ffffff" stroke="#cbd5e1" strokeWidth="2">
            <rect x="40" y="150" width="20" height="36" rx="6" />
            <rect x="340" y="150" width="20" height="36" rx="6" />
            <rect x="40" y="570" width="20" height="36" rx="6" />
            <rect x="340" y="570" width="20" height="36" rx="6" />
          </g>
          <g fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="2">
            <rect x="186" y="70" width="28" height="30" rx="7" />
            <rect x="176" y="100" width="48" height="18" rx="7" />
          </g>
          <g fill="none" stroke="#d1d5db" strokeWidth="2">
            <path d="M180 120 L220 120" />
            <path d="M180 820 L220 820" />
          </g>
        </svg>
        <div className="seat-map__cabin" role="list">
          {sections.map((section) => (
            <section
              key={section.id}
              className="seat-map__section"
              aria-label={section.label}
            >
              {section.label ? (
                <h4 className="seat-map__sr-only">{section.label}</h4>
              ) : null}
              {section.subtitle ? (
                <p className="seat-map__sr-only">{section.subtitle}</p>
              ) : null}
              <div className="seat-map__rows" role="group">
                {section.rows.map((row) => {
                  const rowNumber = parseRowNumber(row.label);
                  const { left, right } = splitRowSeats(row.seats);
                  return (
                    <div
                      key={row.id ?? row.label}
                      className="seat-map__plane-row"
                    >
                      <div className="seat-map__seat-bank seat-map__seat-bank--left">
                        {left.map((seat) => renderSeatButton(seat, rowNumber))}
                      </div>
                      <div className="seat-map__seat-bank seat-map__seat-bank--right">
                        {right.map((seat) => renderSeatButton(seat, rowNumber))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <SeatLegend sections={sections} />

      <footer className="seat-map__footer">
        <div className="seat-map__selection">
          <span className="seat-map__selection-label">Selected seats</span>
          {sortedSelected.length ? (
            <ul className="seat-map__selection-list">
              {sortedSelected.map((seatId) => (
                <li key={seatId} className="seat-map__selection-chip">
                  {seatId}
                </li>
              ))}
            </ul>
          ) : (
            <span className="seat-map__selection-empty">None</span>
          )}
        </div>
        {onConfirmSelection ? (
          <button
            type="button"
            className="seat-map__confirm"
            onClick={handleConfirm}
            disabled={isSyncing || !sortedSelected.length}
          >
            {isSyncing ? 'Saving selection...' : 'Confirm selection'}
          </button>
        ) : null}
      </footer>

      <SeatConfirmationDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConfirm={handleConfirmDialog}
        selectedSeatIds={sortedSelected}
        isSyncing={isSyncing}
      />
    </div>
  );
};

export default SeatMap;
