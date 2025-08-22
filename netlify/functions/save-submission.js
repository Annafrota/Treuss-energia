/*
  (Template de Compra (Purchase) ID: template_gv4q0sc
  Template de Download (eBook) ID: template_6w2zzz8) ???????

  Google Analytics:
  Fluxo Treuss 
  URL do fluxo: https://treuss.netlify.app/
  Código do fluxo: 12058584106
  ID da Métrica: G-XL1VCX8ZKK

*/

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Inicializar o Resend
const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event, context) => {
  console.log('Função save-submission iniciada');

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Variáveis de ambiente faltando');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Configuração do servidor incompleta' })
      };
    }

    const payload = JSON.parse(event.body || '{}');

    // Honeypot anti-bot
    if (payload.company) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: true, message: 'OK' })
      };
    }

    const type = (payload.type || '').toLowerCase();
    if (!['purchase', 'download'].includes(type)) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Tipo inválido' }) };
    }

    // Normalização de campos
    let name = payload.name || payload['d-name'];
    let email = payload.email || payload['d-email'];
    if (!name || !email) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Nome e e-mail são obrigatórios' }) };
    }

    const phone = payload.phone || null;

    let quantity = null;
    let address = null;
    let delivery_notes = null;

    if (type === 'purchase') {
      quantity = Number(payload.quantity || 1);
      const required = ['postal_code', 'address_line1', 'district', 'city', 'state', 'country'];
      for (const f of required) {
        if (!payload[f] || String(payload[f]).trim() === '') {
          return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: `Campo obrigatório faltando: ${f}` }) };
        }
      }
      address = {
        postal_code: payload.postal_code,
        address_line1: payload.address_line1,
        address_line2: payload.address_line2 || null,
        district: payload.district,
        city: payload.city,
        state: payload.state,
        country: payload.country
      };
      delivery_notes = payload.delivery_notes || null;
    }

    let contribution = null;
    let payment_method = null;
    if (type === 'download') {
      contribution = payload['d-contrib'] ? Number(payload['d-contrib']) : (payload.contribution ? Number(payload.contribution) : null);
      payment_method = payload['d-payment_method'] || payload.payment_method || null;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const submissionData = {
      type,
      name,
      email,
      phone,
      quantity,
      contribution,
      payment_method,
      postal_code: address?.postal_code || null,
      address_line1: address?.address_line1 || null,
      address_line2: address?.address_line2 || null,
      district: address?.district || null,
      city: address?.city || null,
      state: address?.state || null,
      country: address?.country || null,
      delivery_notes,
      pix_key_shown: type === 'download',
      created_at: new Date().toISOString(),
      email_status: 'pending'
    };

    const { data: result, error: insertError } = await supabase
      .from('submissions')
      .insert([submissionData])
      .select();

    if (insertError) {
      console.error('Erro Supabase:', insertError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Erro ao salvar dados' })
      };
    }

    // Enviar e-mail via Resend
    let emailSent = false;
    let emailError = null;
    
    try {
      let emailSubject, emailHtml;

      if (type === 'purchase') {
        emailSubject = 'Confirmação de Compra - Treuss';
        emailHtml = `
          <h1>Olá, ${name}!</h1>
          <p>Obrigado por sua compra do livro <strong>Treuss - A Energia Precede a Matéria</strong>.</p>
          <p>Seu pedido foi registrado com sucesso. Em breve enviaremos um e-mail com o Comprovante de Pedido e instruções de pagamento.</p>
          <p><strong>Resumo do pedido:</strong></p>
          <ul>
            <li>Quantidade: ${quantity} exemplar(es)</li>
            <li>Valor total: R$ ${(quantity * 54).toFixed(2)}</li>
          </ul>
          <p>Atenciosamente,<br>Equipe Treuss</p>
        `;
      } else if (type === 'download') {
        emailSubject = 'Download do eBook - Treuss';
        emailHtml = `
          <h1>Olá, ${name}!</h1>
          <p>Obrigado por baixar o eBook <strong>Treuss - A Energia Precede a Matéria</strong>.</p>
          <p>Clique no link abaixo para fazer o download:</p>
          <p><a href="https://drive.google.com/your-download-link" style="background-color: #FFD700; color: black; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Fazer Download</a></p>
          <p>Chave PIX para contribuição: <strong>28421905805</strong></p>
          <p>Atenciosamente,<br>Equipe Treuss</p>
        `;
      }

      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL,
        to: email,
        subject: emailSubject,
        html: emailHtml,
      });

      if (error) {
        throw new Error(error.message);
      }

      emailSent = true;
      console.log('E-mail enviado com sucesso:', data);

      // Atualizar o status do e-mail no Supabase para 'sent'
      await supabase
        .from('submissions')
        .update({ email_status: 'sent' })
        .eq('id', result[0].id);

    } catch (err) {
      emailError = err.message;
      console.error('Erro ao enviar e-mail:', err);

      // Atualizar o status do e-mail no Supabase para 'failed'
      await supabase
        .from('submissions')
        .update({ email_status: 'failed' })
        .eq('id', result[0].id);
    }

    const message = type === 'purchase'
      ? 'Pedido registrado. Você receberá por e-mail o Comprovante de Pedido com os dados completos.'
      : 'Registro efetuado. O link do eBook será enviado por e-mail.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: true, 
        message, 
        id: result?.[0]?.id || null,
        emailSent,
        emailError
      })
    };

  } catch (err) {
    console.error('Erro inesperado:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Erro interno do servidor' })
    };
  }
};
