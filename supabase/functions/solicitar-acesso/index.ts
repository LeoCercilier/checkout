// Edge Function: solicitar-acesso
// Recebe e-mail, gera token temporario e envia link magico via Resend.
// Nao revela se o e-mail tem ou nao compras (mensagem generica).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizarEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function gerarToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ sucesso: false, erro: "Metodo nao permitido." }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizarEmail(body?.email);

    // Mensagem generica sempre (nao vaza se o e-mail existe)
    const msgOk =
      "Se este e-mail tiver compras confirmadas, voce recebera um link de acesso em instantes. Verifique tambem a caixa de spam.";

    if (!emailValido(email)) {
      return json({ sucesso: false, erro: "Informe um e-mail valido." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
    const siteUrl =
      Deno.env.get("SITE_URL") || "https://leocercilier.github.io/checkout";

    if (!resendKey) {
      return json(
        { sucesso: false, erro: "Envio de e-mail nao configurado (RESEND_API_KEY)." },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Rate limit simples: no maximo 1 pedido a cada 2 minutos por e-mail
    const doisMinutosAtras = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentes } = await supabase
      .from("acesso_tokens")
      .select("id")
      .eq("email", email)
      .gte("created_at", doisMinutosAtras)
      .limit(1);

    if (recentes && recentes.length > 0) {
      return json({ sucesso: true, mensagem: msgOk });
    }

    // Verifica se ha pelo menos uma compra paga (sem revelar no response)
    const { data: pedidos, error: pedErr } = await supabase
      .from("pedidos")
      .select("id")
      .ilike("email", email)
      .in("status", ["processed", "approved"])
      .limit(1);

    if (pedErr) {
      console.error("Erro ao buscar pedidos:", pedErr);
      return json({ sucesso: false, erro: "Falha ao processar solicitacao." }, 500);
    }

    if (!pedidos || pedidos.length === 0) {
      // Resposta generica (nao confirma ausencia de compra)
      return json({ sucesso: true, mensagem: msgOk });
    }

    const token = gerarToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    const { error: insErr } = await supabase.from("acesso_tokens").insert({
      email,
      token,
      expires_at: expiresAt,
    });

    if (insErr) {
      console.error("Erro ao salvar token:", insErr);
      return json({ sucesso: false, erro: "Falha ao gerar acesso." }, 500);
    }

    const link = `${siteUrl.replace(/\/$/, "")}/meus-cursos.html?token=${token}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <h2 style="margin-bottom:8px">Acesso aos seus cursos</h2>
        <p>Recebemos um pedido de acesso com este e-mail.</p>
        <p>Clique no botao abaixo para ver os materiais que voce comprou. O link expira em <strong>30 minutos</strong>.</p>
        <p style="margin:28px 0">
          <a href="${link}"
             style="background:#16a34a;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">
            Acessar meus cursos
          </a>
        </p>
        <p style="font-size:13px;color:#64748b">Se voce nao solicitou este acesso, ignore este e-mail.</p>
        <p style="font-size:12px;color:#94a3b8;word-break:break-all">Link alternativo:<br>${link}</p>
      </div>
    `;

    const emailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "Seu link de acesso aos cursos",
        html,
      }),
    });

    if (!emailResp.ok) {
      const errText = await emailResp.text();
      console.error("Resend erro:", emailResp.status, errText);
      return json(
        {
          sucesso: false,
          erro:
            "Nao foi possivel enviar o e-mail agora. Tente novamente em alguns minutos.",
        },
        500,
      );
    }

    return json({ sucesso: true, mensagem: msgOk });
  } catch (e) {
    console.error(e);
    return json({ sucesso: false, erro: "Erro interno." }, 500);
  }
});
