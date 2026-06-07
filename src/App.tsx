import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppSidebar from "@/components/AppSidebar";
import RequireAuth from "@/components/RequireAuth";
import { AuthProvider } from "@/context/AuthContext";
import DashboardPage from "@/pages/DashboardPage";
import MenuPage from "@/pages/MenuPage";
import TablesPage from "@/pages/TablesPage";
import KitchenPage from "@/pages/KitchenPage";
import POSPage from "@/pages/POSPage";
import ReportsPage from "@/pages/ReportsPage";
import InventoryPage from "@/pages/InventoryPage";
import SettingsPage from "@/pages/SettingsPage";
import StaffPage from "@/pages/StaffPage";
import ShiftsPage from "@/pages/ShiftsPage";
import CustomersPage from "@/pages/CustomersPage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function ConditionalSidebar() {
  const location = useLocation();
  if (location.pathname === '/login') return null;
  return <AppSidebar />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename="/restaurant_v2">
        <AuthProvider>
          <ConditionalSidebar />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
            <Route path="/menu" element={<RequireAuth><MenuPage /></RequireAuth>} />
            <Route path="/tables" element={<RequireAuth><TablesPage /></RequireAuth>} />
            <Route path="/kitchen" element={<RequireAuth><KitchenPage /></RequireAuth>} />
            <Route path="/pos" element={<RequireAuth><POSPage /></RequireAuth>} />
            <Route path="/inventory" element={<RequireAuth><InventoryPage /></RequireAuth>} />
            <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
            <Route path="/staff" element={<RequireAuth><StaffPage /></RequireAuth>} />
            <Route path="/shifts" element={<RequireAuth><ShiftsPage /></RequireAuth>} />
            <Route path="/customers" element={<RequireAuth><CustomersPage /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
