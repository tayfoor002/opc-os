import Link from "next/link";
import { Activity, Boxes, FileText, LayoutDashboard, Map, Settings } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/zones", label: "Zones", icon: Map },
  { href: "/activites", label: "Activités", icon: Activity },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/materiels", label: "Matériels / Équipements", icon: Boxes }
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div>
        <div className="brand">OPC OS</div>
        <div className="brandSub">Pilotage chantier connecté</div>
      </div>

      <nav className="nav">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} className="navLink" href={href}>
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebarFooter">
        <Settings size={18} />
        <span>Paramètres</span>
      </div>
    </aside>
  );
}
