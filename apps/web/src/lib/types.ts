export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface ComputerRow {
  id: string;
  name: string;
  stationNumber: string | null;
  status: string;
  localIp: string | null;
  agentVersion: string | null;
  group?: { id: string; name: string; billingRatio: number } | null;
  agent?: { isOnline: boolean; lastHeartbeat: string | null; version: string | null } | null;
}

export interface CustomerRow {
  id: string;
  customerNumber: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
  group?: { id: string; name: string } | null;
  balance?: {
    moneyMinor: number;
    timeSecondsRemaining: number;
    printBwRemaining: number;
  } | null;
}

export interface SessionRow {
  id: string;
  status: string;
  billingSource: string;
  startedAt: string | null;
  amountMinor: number;
  computer?: { id: string; name: string; stationNumber: string | null } | null;
  customer?: { id: string; fullName: string; customerNumber: number } | null;
}

export interface PackageRow {
  id: string;
  type: string;
  name: string;
  prices: { priceMinor: number }[];
}

export interface ProductRow {
  id: string;
  name: string;
  priceMinor: number;
}

export interface RevenueReport {
  usageRevenueMinor: number;
  sessionsEnded: number;
  salesRevenueMinor: number;
  refundsMinor: number;
  netRevenueMinor: number;
  paymentsByMethod: { method: string; totalMinor: number }[];
}

export interface UsageReport {
  sessions: number;
  totalSeconds: number;
  avgSeconds: number;
  topComputers: { computerId: string; seconds: number; revenueMinor: number }[];
}

export interface RoomRow {
  id: string;
  name: string;
  floor: string | null;
  branch?: { id: string; name: string } | null;
  _count?: { computers: number };
}

export interface FloorComputer {
  id: string;
  name: string;
  stationNumber: string | null;
  status: string;
  localIp: string | null;
  connectedUser: string | null;
  sessionStartedAt: string | null;
}

export interface FloorData {
  room: { id: string; name: string; floor: string | null; wing: string | null };
  floorPlan: { width: number; height: number; layout: { computerId: string; x: number; y: number }[] };
  computers: FloorComputer[];
}

export interface PrintJobRow {
  id: string;
  documentName: string | null;
  pages: number;
  copies: number;
  colorMode: string;
  paperSize: string;
  totalMinor: number;
  status: string;
  createdAt: string;
  customer?: { fullName: string } | null;
  computer?: { name: string } | null;
}

export interface TicketRow {
  id: string;
  number: number;
  title: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  computer?: { name: string; stationNumber: string | null } | null;
}

export interface ReservationRow {
  id: string;
  startAt: string;
  durationMin: number;
  status: string;
  confirmationCode: string | null;
  customer?: { fullName: string; phone: string | null } | null;
  computer?: { name: string; stationNumber: string | null } | null;
}

export interface DashboardMetrics {
  computers: {
    total: number;
    available: number;
    inUse: number;
    disconnected: number;
    fault: number;
    maintenance: number;
    reserved: number;
  };
  activeSessions: number;
  connectedCustomers: number;
  revenueTodayMinor: number;
  revenueMonthMinor: number;
  usageSecondsToday: number;
  printsToday: number;
  openDebtsMinor: number;
}
