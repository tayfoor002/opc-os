import {
  Bot,
  CalendarDays,
  ActivitySquare,
  ChartNoAxesCombined,
  CheckSquare2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  Info,
  TrendingUp,
  Users
} from "lucide-react";

export const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Planning", icon: CalendarDays, href: "/planning" },
  { label: "Activities", icon: ActivitySquare, href: "/activities" },
  { label: "Tasks", icon: CheckSquare2, href: "/tasks" },
  { label: "Documents", icon: FileText, href: "/documents" },
  { label: "Meetings", icon: ClipboardList, href: "/meetings" },
  { label: "Materials", icon: Package, href: "/materials" },
  { label: "Progress", icon: TrendingUp, href: "/progress" },
  { label: "Reporting", icon: ChartNoAxesCombined, href: "/reporting" },
  { label: "Organization", icon: Users, href: "/organization" },
  { label: "AI Assistant", icon: Bot, href: "/ai" },
  { label: "About OPC OS", icon: Info, href: "/about", footer: true },
  { label: "Settings", icon: Settings, href: "/settings", footer: true }
];
