// Tehran calendar helpers with formatters built once. Building an Intl.DateTimeFormat costs far more than using one,
// and these run once per document in the heavy screens (spec 0004: one core, fast on a busy shop).
const DAYF = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' });
const HOURF = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Tehran' });
const TIMEF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false });
/** The Tehran calendar day (YYYY-MM-DD) of a Date. */
export const tehranDay = (d = new Date()) => DAYF.format(d);
/** The Tehran calendar day of an ISO timestamp. */
export const tehranDayOf = (iso) => DAYF.format(new Date(iso));
/** The Tehran hour (0–23) of an ISO timestamp. */
export const tehranHour = (iso) => Number(HOURF.format(new Date(iso))) % 24;
/** HH:MM in Tehran now. */
export const tehranTime = () => TIMEF.format(new Date());
