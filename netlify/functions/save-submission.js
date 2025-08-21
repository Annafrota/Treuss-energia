/*
  Template de Compra (Purchase) ID: template_gv4q0sc
  Template de Download (eBook) ID: template_6w2zzz8

  Google Analytics:
  Fluxo Treuss 
  URL do fluxo: https://treuss.netlify.app/
  Código do fluxo: 12058584106
  ID da Métrica: G-XL1VCX8ZKK

  O envio de e-mails agora é totalmente gerenciado pelo frontend através do EmailJS, 
  conforme implementado em index.html (Landing Page)
*/

const { createClient } = require('@supabase/supabase-js');

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
      email_status: 'sent' // Agora sempre marcado como enviado já que o EmailJS cuida do envio
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
        emailSent: true, // Sempre true já que o EmailJS cuida do envio
        emailError: null
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
