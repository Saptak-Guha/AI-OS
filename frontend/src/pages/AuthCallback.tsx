import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { setToken, fetchUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      setToken(token);
      fetchUser().then(() => navigate("/"));
    } else {
      navigate("/login");
    }
  }, [params, setToken, fetchUser, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-slate-400">Completing authentication...</p>
    </div>
  );
}
