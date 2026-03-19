import { Outlet } from "react-router";
import Header from "@/components/Header";
import { SidebarProvider } from "@/providers/SidebarContext";

export default function AppLayout() {
    return (
        <SidebarProvider>
            <div className="flex h-screen flex-col bg-background overflow-hidden">
                <Header />
                <div className="pt-[80px] flex-1 min-h-0">
                    <Outlet />
                </div>
            </div>
        </SidebarProvider>
    );
}
