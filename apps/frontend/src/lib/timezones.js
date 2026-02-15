const SIMPLE_TIMEZONE_OPTIONS = [
  { value: "UTC", label: "(GMT+00:00) UTC" },
  { value: "Europe/London", label: "(GMT+00:00) UK - London" },
  { value: "Europe/Paris", label: "(GMT+01:00) Europe - Paris" },
  { value: "Europe/Berlin", label: "(GMT+01:00) Europe - Berlin" },
  { value: "Europe/Moscow", label: "(GMT+03:00) Europe - Moscow" },
  { value: "Asia/Dubai", label: "(GMT+04:00) UAE - Dubai" },
  { value: "Asia/Karachi", label: "(GMT+05:00) Pakistan - Karachi" },
  { value: "Asia/Kolkata", label: "(GMT+05:30) India - Chennai (Asia/Kolkata)" },
  { value: "Asia/Kathmandu", label: "(GMT+05:45) Nepal - Kathmandu" },
  { value: "Asia/Dhaka", label: "(GMT+06:00) Bangladesh - Dhaka" },
  { value: "Asia/Bangkok", label: "(GMT+07:00) Thailand - Bangkok" },
  { value: "Asia/Singapore", label: "(GMT+08:00) Singapore" },
  { value: "Asia/Shanghai", label: "(GMT+08:00) China - Shanghai" },
  { value: "Asia/Tokyo", label: "(GMT+09:00) Japan - Tokyo" },
  { value: "Australia/Sydney", label: "(GMT+10:00) Australia - Sydney" },
  { value: "Pacific/Auckland", label: "(GMT+12:00) New Zealand - Auckland" },
  { value: "America/New_York", label: "(GMT-05:00) USA - New York" },
  { value: "America/Chicago", label: "(GMT-06:00) USA - Chicago" },
  { value: "America/Denver", label: "(GMT-07:00) USA - Denver" },
  { value: "America/Los_Angeles", label: "(GMT-08:00) USA - Los Angeles" },
  { value: "America/Toronto", label: "(GMT-05:00) Canada - Toronto" },
  { value: "America/Sao_Paulo", label: "(GMT-03:00) Brazil - Sao Paulo" },
  { value: "Africa/Johannesburg", label: "(GMT+02:00) South Africa - Johannesburg" },
];

export const TIMEZONE_OPTIONS = SIMPLE_TIMEZONE_OPTIONS;

export function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (error) {
    return "";
  }
}
