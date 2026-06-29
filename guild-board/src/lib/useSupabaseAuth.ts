"use client";

import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AuthState = {
  enabled: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  message: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export function useSupabaseAuth(): AuthState {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState(
    supabase ? "正在检查登录状态" : "未配置 Supabase Auth",
  );

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let alive = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) {
        return;
      }
      if (error) {
        setMessage(error.message);
      }
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      setMessage(nextSession ? "账号已登录" : "账号未登录");
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return {
    enabled: Boolean(supabase),
    loading,
    session,
    user: session?.user ?? null,
    message,
    signIn: async (email: string, password: string) => {
      if (!supabase) {
        setMessage("未配置 Supabase Auth");
        return;
      }
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      setMessage(error ? error.message : "登录成功");
    },
    signUp: async (email: string, password: string) => {
      if (!supabase) {
        setMessage("未配置 Supabase Auth");
        return;
      }
      setLoading(true);
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      setMessage(error ? error.message : "注册成功；如果项目开启邮件确认，请先查收邮件");
    },
    signOut: async () => {
      if (!supabase) {
        return;
      }
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      setLoading(false);
      setMessage(error ? error.message : "已退出登录");
    },
  };
}

