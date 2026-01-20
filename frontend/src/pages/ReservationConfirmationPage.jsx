import { useEffect, useMemo, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { fetchReservationById, updateReservationSeatSelection } from '../apiClient';
import SeatMap from '../components/SeatMap';
import './ReservationConfirmationPage.css';

const formatDateTime = (iso) => {
  if (!iso) {
    return '';
  }
  const dt = new Date(iso);
  return dt.toLocaleString(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  });
};

const getLocalDateWithOffset = (iso) => {
  if (!iso || typeof iso !== 'string') {
    return null;
  }
  const isoMatch = iso.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!isoMatch) {
    return null;
  }
  const [, , offset] = isoMatch;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  let offsetMinutes = 0;
  if (offset !== 'Z') {
    const sign = offset.startsWith('-') ? -1 : 1;
    const [hours, minutes] = offset.slice(1).split(':').map(Number);
    offsetMinutes = sign * (hours * 60 + minutes);
  }
  const localMillis = date.getTime() + offsetMinutes * 60 * 1000;
  return {
    date: new Date(localMillis),
    offsetMinutes,
  };
};

const formatOffsetLabel = (offsetMinutes) => {
  if (offsetMinutes === 0) {
    return 'UTC';
  }
  const sign = offsetMinutes > 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
};

const formatDateTimeWithOffset = (iso) => {
  const local = getLocalDateWithOffset(iso);
  if (!local) {
    return { display: formatDateTime(iso), offset: '' };
  }
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  return {
    display: formatter.format(local.date),
    offset: formatOffsetLabel(local.offsetMinutes),
  };
};

const formatDate = (iso) => {
  if (!iso) {
    return '';
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return '';
  }
  return dt.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatMoney = (value, currency = 'USD') => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '';
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(value);
};

const formatPassengerLabel = (index) => `Passenger ${index + 1}`;

function ReservationConfirmationPage() {
  const { reservationId: paramReservationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const fallbackId = searchParams.get('id') || '';
  const reservationId = paramReservationId || fallbackId;

  const preloadedReservation =
    location.state?.reservation &&
    location.state.reservation.reservationId === reservationId
      ? location.state.reservation
      : null;

  const [reservation, setReservation] = useState(preloadedReservation || null);
  const [loading, setLoading] = useState(!preloadedReservation);
  const [error, setError] = useState(reservationId ? '' : 'Reservation ID missing from the link.');
  const [refreshCount, setRefreshCount] = useState(0);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [seatMap, setSeatMap] = useState(preloadedReservation?.seatMap ?? null);
  const [selectedSeats, setSelectedSeats] = useState(
    preloadedReservation?.seatSelection?.selectedSeats ?? preloadedReservation?.selectedSeats ?? [],
  );
  const [seatSelectionUpdatedAt, setSeatSelectionUpdatedAt] = useState(
    preloadedReservation?.seatSelection?.updatedAt ?? '',
  );
  const [seatSyncError, setSeatSyncError] = useState('');
  const [isSyncingSeats, setIsSyncingSeats] = useState(false);
  const [isSeatModalOpen, setSeatModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!reservationId) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function loadReservation() {
      try {
        setError('');
        const { reservation: normalized } = await fetchReservationById(reservationId);
        if (!cancelled) {
          setReservation(normalized);
          setError('');
          setSeatMap(normalized.seatMap ?? null);
          setSelectedSeats(
            normalized.seatSelection?.selectedSeats ?? normalized.selectedSeats ?? [],
          );
          setSeatSelectionUpdatedAt(normalized.seatSelection?.updatedAt ?? '');
          setSeatSyncError('');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load reservation', err);
          const message =
            err?.message ??
            'Unable to retrieve the reservation at this time. Please try again later.';
          setError(message);
          setReservation(null);
          setSeatMap(null);
          setSelectedSeats([]);
          setSeatSelectionUpdatedAt('');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const hasInitialPreload = Boolean(preloadedReservation) && refreshCount === 0;

    if (hasInitialPreload) {
      setReservation(preloadedReservation);
      setSeatMap(preloadedReservation?.seatMap ?? null);
      setSelectedSeats(
        preloadedReservation?.seatSelection?.selectedSeats ??
          preloadedReservation?.selectedSeats ??
          [],
      );
      setSeatSelectionUpdatedAt(preloadedReservation?.seatSelection?.updatedAt ?? '');
      setSeatSyncError('');
    }

    if (!hasInitialPreload || refreshCount > 0) {
      setLoading(true);
    } else {
      setLoading(false);
    }

    loadReservation();

    return () => {
      cancelled = true;
    };
  }, [reservationId, refreshCount, preloadedReservation]);

  const flight = reservation?.flight ?? null;
  const departure = flight?.from ?? null;
  const arrival = flight?.to ?? null;
  const departureCity = departure?.city ?? flight?.departure_city ?? '';
  const departureCode = departure?.code ?? flight?.departure_airport_code ?? '';
  const departureAirportName = departure?.airport ?? flight?.departure_airport ?? '';
  const departureTimeIso = departure?.departure_time ?? flight?.departure_time ?? '';
  const arrivalCity = arrival?.city ?? flight?.arrival_city ?? '';
  const arrivalCode = arrival?.code ?? flight?.arrival_airport_code ?? '';
  const arrivalAirportName = arrival?.airport ?? flight?.arrival_airport ?? '';
  const arrivalTimeIso = arrival?.arrival_time ?? flight?.arrival_time ?? '';
  const hasRouteMeta = Boolean(departureTimeIso || arrivalTimeIso || flight?.duration);
  const departureLocal = useMemo(
    () => formatDateTimeWithOffset(departureTimeIso),
    [departureTimeIso],
  );
  const arrivalLocal = useMemo(
    () => formatDateTimeWithOffset(arrivalTimeIso),
    [arrivalTimeIso],
  );
  const seatSelectionUpdatedLabel = useMemo(
    () => (seatSelectionUpdatedAt ? formatDateTime(seatSelectionUpdatedAt) : ''),
    [seatSelectionUpdatedAt],
  );
  const availableSeatCount = seatMap?.meta?.availableSeats;
  const bookedSeatCount = seatMap?.meta?.bookedSeats;
  const selectedSeatChips = useMemo(() => {
    if (!selectedSeats?.length) {
      return [];
    }
    return [...selectedSeats].sort();
  }, [selectedSeats]);
  const canOpenSeatMap = Boolean(seatMap);
  const totalDue = useMemo(() => {
    if (typeof reservation?.bill?.total === 'number') {
      return reservation.bill.total;
    }
    if (typeof reservation?.bill?.subtotal === 'number') {
      return reservation.bill.subtotal;
    }
    return reservation?.totalPriceUsd ?? null;
  }, [reservation]);
  const currency = reservation?.bill?.currency ?? 'USD';
  const passengers = reservation?.passengers ?? [];
  const passengerCount = reservation?.passengerCount ?? passengers.length;

  const paymentBreakdown = useMemo(() => {
    if (!reservation?.bill) {
      return [];
    }
    const lines = [];
    if (reservation.bill.currency) {
      lines.push({ label: 'Currency', value: reservation.bill.currency });
    }
    if (typeof reservation.bill.unit_price === 'number') {
      lines.push({
        label: 'Unit price',
        value: formatMoney(reservation.bill.unit_price, currency),
      });
    }
    if (typeof reservation.bill.passengers === 'number') {
      lines.push({ label: 'Passengers billed', value: reservation.bill.passengers });
    }
    if (typeof reservation.bill.subtotal === 'number') {
      lines.push({
        label: 'Subtotal',
        value: formatMoney(reservation.bill.subtotal, currency),
      });
    }
    if (typeof reservation.bill.total === 'number') {
      lines.push({
        label: 'Total due',
        value: formatMoney(reservation.bill.total, currency),
      });
    }
    return lines;
  }, [reservation, currency]);

  const handleRetry = () => {
    setRefreshCount((count) => count + 1);
  };

  const handleOpenSeatModal = () => {
    if (!canOpenSeatMap) {
      return;
    }
    setSeatSyncError('');
    setSeatModalOpen(true);
  };

  const handleCloseSeatModal = () => {
    setSeatModalOpen(false);
  };

  const handleSeatToggle = (seatId) => {
    if (!reservation || !seatId || isSyncingSeats) {
      return;
    }
    const normalized = String(seatId).trim().toUpperCase();
    if (!normalized) {
      return;
    }
    const fallbackPassengerCount =
      (Array.isArray(reservation.passengers) && reservation.passengers.length) || 1;
    const maxSelectable = Math.max(
      1,
      reservation.passengerCount ?? fallbackPassengerCount,
    );

    setSelectedSeats((prev) => {
      const alreadySelected = prev.includes(normalized);
      if (alreadySelected) {
        setSeatSyncError('');
        return prev.filter((seat) => seat !== normalized);
      }
      if (prev.length >= maxSelectable) {
        setSeatSyncError(
          `You can select up to ${maxSelectable} seat${maxSelectable === 1 ? '' : 's'}.`,
        );
        return prev;
      }
      setSeatSyncError('');
      return [...prev, normalized];
    });
  };

  const handleSeatConfirm = async (seatIds) => {
    if (!reservationId || !reservation) {
      setSeatSyncError('Reservation information is required before selecting seats.');
      return;
    }
    if (isSyncingSeats) {
      return;
    }
    const seatsToPersist = Array.isArray(seatIds) ? seatIds : selectedSeats;
    const fallbackPassengerCount =
      (Array.isArray(reservation.passengers) && reservation.passengers.length) || 1;
    const maxSelectable = Math.max(
      1,
      reservation.passengerCount ?? fallbackPassengerCount,
    );
    const trimmedSeats =
      seatsToPersist.length > maxSelectable
        ? seatsToPersist.slice(0, maxSelectable)
        : seatsToPersist;

    const previousServerSeats =
      reservation.seatSelection?.selectedSeats ?? reservation.selectedSeats ?? [];

    setIsSyncingSeats(true);
    setSeatSyncError('');

    try {
      const { reservation: updated } = await updateReservationSeatSelection({
        reservationId,
        seats: trimmedSeats,
      });
      setReservation(updated);
      setSeatMap(updated.seatMap ?? null);
      setSelectedSeats(
        updated.seatSelection?.selectedSeats ?? updated.selectedSeats ?? trimmedSeats,
      );
      setSeatSelectionUpdatedAt(updated.seatSelection?.updatedAt ?? '');
      setSeatSyncError('');
      setSeatModalOpen(false);
    } catch (err) {
      console.error('Failed to update seat selection', err);
      const message =
        err?.message ?? 'We could not save your seat selection. Please try again.';
      setSeatSyncError(message);
      setSelectedSeats(previousServerSeats);
    } finally {
      setIsSyncingSeats(false);
    }
  };

  useEffect(() => {
    if (!isSeatModalOpen) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSeatModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSeatModalOpen]);

  const handlePayment = async () => {
    if (!reservation || isProcessingPayment) {
      return;
    }
    setIsProcessingPayment(true);
    setPaymentMessage('');
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setPaymentMessage(
        'Payment processing is not connected yet. Hook up your payment gateway to capture funds.',
      );
    } catch (err) {
      console.error('Payment handler failed', err);
      setPaymentMessage('We could not start the payment flow. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="reservation-confirmation-page">
      <div className="reservation-confirmation-page__content">
        <div className="reservation-confirmation-page__top">
          <button
            type="button"
            className="reservation-confirmation-back"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
          <div className="reservation-confirmation-brand">
            <span className="reservation-confirmation-brand__mark">ez</span>
            <span className="reservation-confirmation-brand__name">booking</span>
            <span className="reservation-confirmation-brand__trade">TM</span>
          </div>
        </div>

        <header className="reservation-confirmation-header">
          <p className="reservation-confirmation-header__eyebrow">Booking confirmation</p>
          <h1 className="reservation-confirmation-header__title">
            {reservationId ? `Reservation ${reservationId}` : 'Reservation'}
          </h1>
          {reservation?.bookedAt ? (
            <p className="reservation-confirmation-header__timestamp">
              Confirmed {formatDateTime(reservation.bookedAt)}
            </p>
          ) : null}
          {flight ? (
            <div className="reservation-flight-route">
              <div className="reservation-flight-route__main">
                <span className="reservation-flight-route__city">
                  {departureCity || departureCode
                    ? `${departureCity || 'Departure'}${departureCode ? ` (${departureCode})` : ''}`
                    : '-'}
                </span>
                <span className="reservation-flight-route__icon" aria-hidden="true">
                  ✈
                </span>
                <span className="reservation-flight-route__city">
                  {arrivalCity || arrivalCode
                    ? `${arrivalCity || 'Arrival'}${arrivalCode ? ` (${arrivalCode})` : ''}`
                    : '-'}
                </span>
              </div>
              {hasRouteMeta ? (
                <div className="reservation-flight-route__meta">
                  {departureTimeIso ? (
                    <span>Depart {departureLocal.display}{departureLocal.offset ? ` (${departureLocal.offset})` : ''}</span>
                  ) : null}
                  {flight?.duration ? <span>Duration {flight.duration}</span> : null}
                  {arrivalTimeIso ? <span>Arrive {arrivalLocal.display}{arrivalLocal.offset ? ` (${arrivalLocal.offset})` : ''}</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </header>

        <main className="reservation-confirmation-card">
          {loading ? (
            <div className="reservation-confirmation-status">Loading reservation details…</div>
          ) : error ? (
            <div className="reservation-confirmation-error">
              <p>{error}</p>
              <div className="reservation-confirmation-error__actions">
                <button type="button" onClick={handleRetry}>
                  Try again
                </button>
                <button type="button" onClick={() => navigate('/')}>
                  Back to assistant
                </button>
              </div>
            </div>
          ) : reservation ? (
            <>
              <section className="reservation-section">
                <h2>Booking overview</h2>
                <div className="reservation-details-grid">
                  <div>
                    <span className="reservation-details-label">Passengers</span>
                    <span className="reservation-details-value">
                      {passengerCount}{' '}
                      {passengerCount === 1 ? 'traveler' : 'travelers'}
                    </span>
                  </div>
                  {reservation.seatClass ? (
                    <div>
                      <span className="reservation-details-label">Cabin class</span>
                      <span className="reservation-details-value">
                        {reservation.seatClass}
                      </span>
                    </div>
                  ) : null}
                  {typeof totalDue === 'number' ? (
                    <div>
                      <span className="reservation-details-label">Total price</span>
                      <span className="reservation-details-value">
                        {formatMoney(totalDue, currency)}
                      </span>
                    </div>
                  ) : null}
                  {flight?.flight_number ? (
                    <div>
                      <span className="reservation-details-label">Flight</span>
                      <span className="reservation-details-value">{flight.flight_number}</span>
                    </div>
                  ) : null}
                  {flight?.flight_id ? (
                    <div>
                      <span className="reservation-details-label">Flight ID</span>
                      <span className="reservation-details-value">{flight.flight_id}</span>
                    </div>
                  ) : null}
                  {flight?.status ? (
                    <div>
                      <span className="reservation-details-label">Status</span>
                      <span className="reservation-details-value">{flight.status}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="reservation-section reservation-section--seat-summary">
                <div className="reservation-seat-summary">
                  <div className="reservation-seat-summary__content">
                    <p className="reservation-seat-summary__label">Seat selection</p>
                    <div className="reservation-seat-summary__meta">
                      <span>Selected seats:</span>
                      {selectedSeatChips.length ? (
                        <ul className="reservation-seat-summary__chips">
                          {selectedSeatChips.map((seatId) => (
                            <li key={seatId} className="reservation-seat-summary__chip">
                              {seatId}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="reservation-seat-summary__empty">
                          None chosen yet
                        </span>
                      )}
                    </div>
                    <div className="reservation-seat-summary__meta">
                      {typeof availableSeatCount === 'number' ? (
                        <span className="reservation-seat-summary__availability">
                          {availableSeatCount} available
                          {typeof bookedSeatCount === 'number'
                            ? ` · ${bookedSeatCount} booked`
                            : ''}
                        </span>
                      ) : (
                        <span className="reservation-seat-summary__availability">
                          Seat map will appear once published.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="reservation-seat-summary__cta">
                    <button
                      type="button"
                      className="reservation-seat-summary__button"
                      onClick={handleOpenSeatModal}
                      disabled={!canOpenSeatMap}
                    >
                      Select seat
                    </button>
                  </div>
                </div>
                {seatSelectionUpdatedLabel ? (
                  <p className="reservation-seat-selection-meta">
                    Last updated {seatSelectionUpdatedLabel}
                  </p>
                ) : null}
              </section>

              <section className="reservation-section reservation-section--split">
                <div className="reservation-card reservation-card--itinerary">
                  <h3>Flight itinerary</h3>
                  <dl className="reservation-definition">
                    {flight?.airline ? (
                      <>
                        <dt>Airline</dt>
                        <dd>{flight.airline}</dd>
                      </>
                    ) : null}
                    {departureCity || departureCode || arrivalCity || arrivalCode ? (
                      <>
                        <dt>Route</dt>
                        <dd className="reservation-definition__route">
                          {departureCity || departureCode
                            ? `${departureCity || 'Unknown'}${departureCode ? ` (${departureCode})` : ''}`
                            : 'N/A'}{' '}
                          <span aria-hidden="true">✈</span>{' '}
                          {arrivalCity || arrivalCode
                            ? `${arrivalCity || 'Unknown'}${arrivalCode ? ` (${arrivalCode})` : ''}`
                            : 'N/A'}
                        </dd>
                      </>
                    ) : null}
                    {departureTimeIso ? (
                      <>
                        <dt>Departure</dt>
                        <dd>
                          {departureLocal.display}
                          {departureAirportName
                            ? ` - ${departureAirportName}${departureCode ? ` (${departureCode})` : ''}`
                            : ''}
                          {departureLocal.offset ? ` (${departureLocal.offset})` : ''}
                        </dd>
                      </>
                    ) : null}
                    {arrivalTimeIso ? (
                      <>
                        <dt>Arrival</dt>
                        <dd>
                          {arrivalLocal.display}
                          {arrivalAirportName
                            ? ` - ${arrivalAirportName}${arrivalCode ? ` (${arrivalCode})` : ''}`
                            : ''}
                          {arrivalLocal.offset ? ` (${arrivalLocal.offset})` : ''}
                        </dd>
                      </>
                    ) : null}
                    {flight?.duration ? (
                      <>
                        <dt>Duration</dt>
                        <dd>{flight.duration}</dd>
                      </>
                    ) : null}
                    {flight?.aircraft_type ? (
                      <>
                        <dt>Aircraft</dt>
                        <dd>{flight.aircraft_type}</dd>
                      </>
                    ) : null}
                    {flight?.baggage_allowance ? (
                      <>
                        <dt>Baggage</dt>
                        <dd>{flight.baggage_allowance}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>

                <div className="reservation-card reservation-card--payment">
                  <h3>Payment summary</h3>
                  {paymentBreakdown.length ? (
                    <ul className="reservation-payment-list">
                      {paymentBreakdown.map((line) => (
                        <li key={line.label}>
                          <span>{line.label}</span>
                          <span>{line.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="reservation-muted">
                      Billing details will appear once pricing is finalized.
                    </p>
                  )}
                </div>
              </section>

              <section className="reservation-section">
                <h3>Passenger details</h3>
                {passengers.length ? (
                  <ul className="reservation-passenger-list">
                    {passengers.map((passenger, index) => {
                      const formattedDob =
                        passenger?.dob && (formatDate(passenger.dob) || passenger.dob);
                      const hasMeta =
                        typeof passenger?.age === 'number' ||
                        Boolean(passenger?.gender) ||
                        Boolean(formattedDob);

                      return (
                        <li key={passenger.email ?? index}>
                          <div className="reservation-passenger-header">
                            <span>{formatPassengerLabel(index)}</span>
                            {passenger?.name ? <strong>{passenger.name}</strong> : null}
                          </div>
                          {hasMeta ? (
                            <div className="reservation-passenger-details">
                              {typeof passenger?.age === 'number' ? (
                                <div className="reservation-passenger-detail">
                                  <span className="reservation-passenger-detail__label">Age</span>
                                  <span className="reservation-passenger-detail__value">
                                    {passenger.age}
                                  </span>
                                </div>
                              ) : null}
                              {passenger?.gender ? (
                                <div className="reservation-passenger-detail">
                                  <span className="reservation-passenger-detail__label">Gender</span>
                                  <span className="reservation-passenger-detail__value">
                                    {passenger.gender}
                                  </span>
                                </div>
                              ) : null}
                              {formattedDob ? (
                                <div className="reservation-passenger-detail">
                                  <span className="reservation-passenger-detail__label">DOB</span>
                                  <span className="reservation-passenger-detail__value">
                                    {formattedDob}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {passenger?.email ? (
                            <div className="reservation-passenger-contact">
                              <span className="reservation-passenger-detail__label">Email</span>
                              <a href={`mailto:${passenger.email}`}>
                                {passenger.email}
                              </a>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="reservation-muted">Passenger details will appear once provided.</p>
                )}
              </section>

              <footer className="reservation-confirmation-footer">
                {paymentMessage ? (
                  <p className="reservation-payment-message">{paymentMessage}</p>
                ) : null}
                <button
                  type="button"
                  className="reservation-confirmation-pay"
                  onClick={handlePayment}
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? 'Processing…' : 'Confirm & Pay'}
                </button>
              </footer>

              {isSeatModalOpen && canOpenSeatMap ? (
                <div
                  className="reservation-seat-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="seat-map-modal-title"
                  aria-describedby="seat-map-modal-description"
                  onClick={handleCloseSeatModal}
                >
                  <div
                    className="reservation-seat-modal__dialog"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <header className="reservation-seat-modal__header">
                      <h3 id="seat-map-modal-title">Select your seats</h3>
                      <button
                        type="button"
                        className="reservation-seat-modal__close"
                        onClick={handleCloseSeatModal}
                      >
                        Close
                      </button>
                    </header>
                    <div className="reservation-seat-modal__body">
                      <SeatMap
                        seatMap={seatMap}
                        selectedSeats={selectedSeats}
                        onSeatToggle={handleSeatToggle}
                        onConfirmSelection={handleSeatConfirm}
                        isSyncing={isSyncingSeats}
                        syncError={seatSyncError}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="reservation-confirmation-status">
              No reservation data found for this link.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default ReservationConfirmationPage;
