import { Outlet } from "react-router";
import Header from "@/components/Header";
import { SidebarProvider } from "@/providers/SidebarContext";

export default function AppLayout() {
    return (
        <SidebarProvider>
            <div className="flex flex-col min-h-screen bg-background">
                <Header />
                <div className="pt-[70px] flex-1">
                    <Outlet />
                </div>
            </div>
        </SidebarProvider>
    );
}
