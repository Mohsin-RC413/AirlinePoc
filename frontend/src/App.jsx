import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import {
  API_BASE_URL,
  createSession,
  sendChatMessage,
  extractAssistantReplies,
  extractReservations,
  extractSessionId,
} from './apiClient';
import BookingPage from './pages/BookingPage';
import ReservationConfirmationPage from './pages/ReservationConfirmationPage';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SUGGESTED_PROMPTS = [
  'Create a new trip',
  'Inspire me where to go',
  'Weekend getaways',
  'Beautiful hotels in Europe',
];

const INITIAL_MESSAGES = [
  {
    id: 'welcome',
    author: 'assistant',
    text: 'Hi! I am your Air Travel assistant. Ask me about flights, availability, or bookings and I will help you right away.',
  },
];

const MARKDOWN_COMPONENTS = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};

function buildCalendarMonths(calendarDays) {
  if (!calendarDays.length) {
    return [];
  }

  const monthMap = new Map();

  calendarDays.forEach((day) => {
    const [yearStr, monthStr] = day.date.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const key = `${year}-${monthIndex}`;

    if (!monthMap.has(key)) {
      const label = new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
      monthMap.set(key, {
        id: key,
        year,
        monthIndex,
        label,
        daysByIso: {},
      });
    }

    monthMap.get(key).daysByIso[day.date] = day;
  });

  return Array.from(monthMap.values())
    .map((month) => {
      const firstDay = new Date(month.year, month.monthIndex, 1);
      const totalDays = new Date(month.year, month.monthIndex + 1, 0).getDate();
      const leadingPlaceholders = firstDay.getDay();
      const cells = [];

      for (let pad = 0; pad < leadingPlaceholders; pad += 1) {
        cells.push({ key: `${month.id}-pad-${pad}`, empty: true });
      }

      for (let dayNumber = 1; dayNumber <= totalDays; dayNumber += 1) {
        const iso = [
          month.year,
          String(month.monthIndex + 1).padStart(2, '0'),
          String(dayNumber).padStart(2, '0'),
        ].join('-');
        const flights = month.daysByIso[iso]?.flights ?? [];
        cells.push({
          key: iso,
          iso,
          dayNumber,
          flights,
        });
      }

      const trailing =
        (7 - (cells.length % 7)) % 7; /* ensure full weeks for consistent grid */
      for (let pad = 0; pad < trailing; pad += 1) {
        cells.push({ key: `${month.id}-trail-${pad}`, empty: true });
      }

      return {
        ...month,
        cells,
      };
    })
    .sort((a, b) => {
      if (a.year === b.year) {
        return a.monthIndex - b.monthIndex;
      }
      return a.year - b.year;
    });
}

function formatFullDate(iso) {
  if (!iso) {
    return '';
  }
  const [year, month, day] = iso.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function ChatApp() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [calendarDays, setCalendarDays] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [chatError, setChatError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatWindowRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const el = chatWindowRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sessionLoading, isSending, chatError]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCalendar() {
      try {
        setCalendarLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/arrivals`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload = await response.json();
        const days = payload?.calendar ?? [];
        setCalendarDays(days);
        setCalendarError('');
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to load arrival calendar', error);
          setCalendarError('Unable to load arrival calendar. Try again later.');
        }
      } finally {
        setCalendarLoading(false);
      }
    }

    loadCalendar();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initSession() {
      try {
        setSessionLoading(true);
        const payload = await createSession();
        if (cancelled) {
          return;
        }
        const sessionName = extractSessionId(payload);
        if (!sessionName) {
          throw new Error('Session identifier missing from response');
        }
        setSessionId(sessionName);
        setChatError('');
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to create chat session', error);
          setChatError(
            'Unable to connect to the airline assistant right now. Please refresh or try again shortly.',
          );
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    }

    initSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (calendarDays.length && !selectedDate) {
      setSelectedDate(calendarDays[0].date);
    }
  }, [calendarDays, selectedDate]);

  const flightsByDate = useMemo(() => {
    const map = new Map();
    calendarDays.forEach((day) => {
      map.set(day.date, day.flights);
    });
    return map;
  }, [calendarDays]);

  const calendarMonths = useMemo(
    () => buildCalendarMonths(calendarDays),
    [calendarDays],
  );

  const selectedFlights = selectedDate
    ? flightsByDate.get(selectedDate) || []
    : [];

  const redirectToReservation = (reservation) => {
    if (!reservation) {
      return;
    }
    const rawId = reservation.reservationId ?? reservation.raw?.reservation_id ?? '';
    const trimmedId = typeof rawId === 'string' ? rawId.trim() : '';
    if (trimmedId) {
      navigate(`/reservation/${encodeURIComponent(trimmedId)}`, {
        state: { reservation },
      });
    } else {
      const fallbackId =
        typeof reservation.raw?.reservation_id === 'string'
          ? reservation.raw.reservation_id
          : '';
      const search = fallbackId ? `?id=${encodeURIComponent(fallbackId)}` : '';
      navigate(`/reservation/confirm${search}`, {
        state: { reservation },
      });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    if (!sessionId) {
      setChatError(
        'Still connecting to the assistant. Please try again in a moment.',
      );
      return;
    }

    const timestamp = Date.now();
    const userMessage = {
      id: `user-${timestamp}`,
      author: 'user',
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setChatError('');
    setIsSending(true);

    try {
      const payload = await sendChatMessage({ sessionId, message: trimmed });
      const replies = extractAssistantReplies(payload);
      const reservations = extractReservations(payload);

      if (reservations.length) {
        const confirmed = reservations[reservations.length - 1];
        redirectToReservation(confirmed);
      }

      if (!replies.length) {
        console.warn('Assistant reply was empty, payload received:', payload);
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-fallback-${timestamp}`,
            author: 'assistant',
            text:
              'I received your message but could not generate a reply. Please try rephrasing or ask another question.',
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        ...replies.map((text, index) => ({
          id: `assistant-${timestamp}-${index}`,
          author: 'assistant',
          text,
        })),
      ]);
    } catch (error) {
      console.error('Failed to send chat message', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          author: 'assistant',
          text:
            'Sorry, I had trouble processing that. Please try again or rephrase your request.',
        },
      ]);
      setChatError(
        'Your last message did not go through. Please try again when you are ready.',
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectDate = (iso) => {
    setSelectedDate(iso);
  };

  const handleQuickPrompt = (prompt) => {
    setInput(prompt);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="page">
      <div className="topbar">
        <header className="brand">
          <span className="brand-mark">ez</span>
          <span className="brand-name">booking</span>
          <span className="brand-trade">tm</span>
        </header>
      </div>
      <div className="hero">
        <section className="headline">
          <h1>Hey, where are we going today?</h1>
          <p>Tell me what you want, and I&apos;ll handle the rest in seconds.</p>
        </section>

        <main className="chat-card">

          <div className="chat-window" ref={chatWindowRef}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-bubble ${message.author}`}
              >
                {message.author === 'assistant' ? (
                  <div className="bubble-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={MARKDOWN_COMPONENTS}
                    >
                      {message.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  message.text
                )}
              </div>
            ))}
            {sessionLoading ? (
              <div className="chat-bubble assistant system">
                Connecting you with an airline specialist…
              </div>
            ) : null}
            {isSending ? (
              <div className="chat-bubble assistant system">Assistant is typing…</div>
            ) : null}
            {chatError && !isSending ? (
              <div className="chat-bubble assistant system warning">{chatError}</div>
            ) : null}
          </div>

          <form className="chat-input" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Help me plan a budget-friendly trip..."
              aria-label="Message the travel concierge"
              disabled={sessionLoading}
              ref={inputRef}
            />
            <button
              type="submit"
              disabled={sessionLoading || isSending || !input.trim()}
            >
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </form>

          <div className="prompt-pills">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="pill"
                onClick={() => handleQuickPrompt(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </main>

        <section className="calendar-card">
          <header className="calendar-header">
            <div>
              <h2>Arrival Calendar</h2>
              <p>
                Explore upcoming arrivals pulled directly from your airline data
                source. Highlighted dates include one or more scheduled flights.
              </p>
            </div>
            {selectedDate ? (
              <span className="calendar-active-date">{formatFullDate(selectedDate)}</span>
            ) : null}
          </header>

          {calendarLoading ? (
            <div className="calendar-loading">Loading calendar…</div>
          ) : calendarError ? (
            <div className="calendar-error">{calendarError}</div>
          ) : calendarMonths.length === 0 ? (
            <div className="no-flights">
              No arrivals found in the current dataset.
            </div>
          ) : (
            <div className="calendar-body">
              <div className="calendar-months">
                {calendarMonths.map((month) => (
                  <article key={month.id} className="calendar-month">
                    <div className="month-label">{month.label}</div>
                    <div className="weekday-row">
                      {WEEKDAY_LABELS.map((label) => (
                        <span key={`${month.id}-${label}`} className="weekday">
                          {label}
                        </span>
                      ))}
                    </div>
                    <div className="month-grid">
                      {month.cells.map((cell) =>
                        cell.empty ? (
                          <span key={cell.key} className="day-cell empty" />
                        ) : (
                          <button
                            key={cell.key}
                            type="button"
                            className={[
                              'day-cell',
                              cell.flights.length ? 'has-flight' : '',
                              selectedDate === cell.iso ? 'selected' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => handleSelectDate(cell.iso)}
                          >
                            <span className="day-number">{cell.dayNumber}</span>
                            {cell.flights.length ? (
                              <span className="flight-count">
                                {cell.flights.length}
                              </span>
                            ) : null}
                          </button>
                        ),
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <aside className="calendar-details">
                {selectedDate ? (
                  <>
                    <h3>{formatFullDate(selectedDate)}</h3>
                    {selectedFlights.length ? (
                      <ul className="flight-list">
                        {selectedFlights.map((flight) => (
                          <li key={flight.flight_id} className="flight-item">
                            <div className="flight-time">
                              <span>{flight.arrival.time}</span>
                              <small>{flight.arrival.utc_offset}</small>
                            </div>
                            <div className="flight-meta">
                              <strong>
                                {flight.airline} | {flight.flight_number}
                              </strong>
                              <span>
                                {flight.departure_city} ({flight.departure_airport_code}) {'->'}
                                {flight.arrival_city} ({flight.arrival_airport_code})
                              </span>
                              <span
                                className={`status status-${flight.status
                                  .toLowerCase()
                                  .replace(/\s+/g, '-')}`}
                              >
                                {flight.status}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="no-flights">
                        No arrivals scheduled for this date.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="no-flights">Select a highlighted date to view arrivals.</p>
                )}
              </aside>
            </div>
          )}
        </section>

        <div className="feedback-tag">Feedback</div>
        <footer className="footer">Powered by AIQ</footer>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatApp />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/reservation/confirm" element={<ReservationConfirmationPage />} />
        <Route path="/reservation/:reservationId" element={<ReservationConfirmationPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
