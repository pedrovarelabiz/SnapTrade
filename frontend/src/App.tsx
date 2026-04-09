import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { RoleSwitcher } from "@/components/shared/RoleSwitcher";

const Index = lazy(() => import("./pages/Index"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Reports = lazy(() => import("./pages/Reports"));
const Subscription = lazy(() => import("./pages/Subscription"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminOverview = lazy(() => import("./pages/AdminOverview"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminConfig = lazy(() => import("./pages/AdminConfig"));
const AdminRevenue = lazy(() => import("./pages/AdminRevenue"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={null}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Index />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Protected */}
              <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
              <Route path="/analytics" element={<AuthGuard><Analytics /></AuthGuard>} />
              <Route path="/reports" element={<AuthGuard><Reports /></AuthGuard>} />
              <Route path="/subscription" element={<AuthGuard><Subscription /></AuthGuard>} />
              <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />

              {/* Admin */}
              <Route path="/admin" element={<AuthGuard requiredRole="admin"><AdminOverview /></AuthGuard>} />
              <Route path="/admin/users" element={<AuthGuard requiredRole="admin"><AdminUsers /></AuthGuard>} />
              <Route path="/admin/config" element={<AuthGuard requiredRole="admin"><AdminConfig /></AuthGuard>} />
              <Route path="/admin/revenue" element={<AuthGuard requiredRole="admin"><AdminRevenue /></AuthGuard>} />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          {import.meta.env.VITE_DEV_MODE === "true" && <RoleSwitcher />}
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
