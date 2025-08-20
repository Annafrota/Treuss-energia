const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Inicializa Resend com chave de API do ambiente
const resend = new Resend(process.env.RESEND_API_KEY);

// Função: e-mail estilizado para compra
async function sendPurchaseEmail(data) {
  try {
    console.log('Preparando e-mail de compra para:', data.email);
    
    const html = `
    <div style="font-family:Arial, sans-serif; background:#111; color:#f5f5f5; padding:20px; border-radius:8px;">
      <div style="text-align:center; margin-bottom:20px;">
        <h2 style="color:#c7a462; margin:10px 0;">Comprovante de Pedido</h2>
      </div>

      <p>Olá, <strong>${data.name}</strong>!</p>
      <p>Recebemos seu pedido de <strong>${data.quantity}x Livro Treuss</strong>.</p>

      <h3 style="color:#c7a462;">Endereço de entrega:</h3>
      <p style="line-height:1.5;">
        ${data.address_line1}${data.address_line2 ? ', ' + data.address_line2 : ''}<br>
        ${data.district} – ${data.city}/${data.state}<br>
        CEP: ${data.postal_code}<br>
        ${data.country}
      </p>
      ${data.delivery_notes ? `<p><em>Obs: ${data.delivery_notes}</em></p>` : ''}

      <hr style="border:0; border-top:1px solid #c7a462; margin:20px 0;">

      <p style="font-size:14px;">
        Guarde este e-mail como seu comprovante oficial.<br>
        Em breve enviaremos instruções de pagamento.
      </p>

      <div style="margin-top:30px; text-align:center; font-size:12px; color:#aaa;">
        <p>Treuss – A Energia Precede a Matéria</p>
        <p>&copy; ${new Date().getFullYear()} Todos os direitos reservados</p>
      </div>
    </div>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: 'Treuss Livro <noreply@treusslivro.com>',
      to: data.email,
      subject: '📖 Comprovante de Pedido – Livro Treuss',
      html,
    });

    if (error) {
      console.error('Erro Resend:', error);
      throw error;
    }

    console.log('E-mail de compra enviado com sucesso:', emailData);
    return emailData;
  } catch (error) {
    console.error('Erro ao enviar e-mail de compra:', error);
    throw error;
  }
}

// Função: e-mail estilizado para download
async function sendDownloadEmail(data) {
  try {
    console.log('Preparando e-mail de download para:', data.email);
    
    const html = `
    <div style="font-family:Arial, sans-serif; background:#111; color:#f5f5f5; padding:20px; border-radius:8px;">
      <div style="text-align:center; margin-bottom:20px;">
        <h2 style="color:#c7a462; margin:10px 0;">Seu eBook está pronto!</h2>
      </div>

      <p>Olá, <strong>${data.name}</strong>!</p>
      <p>Aqui está o link para baixar o eBook:</p>
      <p style="margin:20px 0; text-align:center;">
        <a href="https://meusite.com/livro.pdf" 
          style="background:#c7a462; color:#111; padding:10px 20px; text-decoration:none; border-radius:6px; font-weight:bold;">
          📥 Baixar eBook
        </a>
      </p>

      <hr style="border:0; border-top:1px solid #c7a462; margin:20px 0;">

      <p style="font-size:14px;">
        Se desejar contribuir, use a chave PIX <strong style="color:#c7a462;">pix@treusslivro.com</strong><br>
        ou escolha outra forma de pagamento indicada no site.
      </p>

      <div style="margin-top:30px; text-align:center; font-size:12px; color:#aaa;">
        <p>Treuss – A Energia Precede a Matéria</p>
        <p>&copy; ${new Date().getFullYear()} Todos os direitos reservados</p>
      </div>
    </div>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: 'Treuss Livro <noreply@treusslivro.com>',
      to: data.email,
      subject: '📖 Seu eBook – Livro Treuss',
      html,
    });

    if (error) {
      console.error('Erro Resend:', error);
      throw error;
    }

    console.log('E-mail de download enviado com sucesso:', emailData);
    return emailData;
  } catch (error) {
    console.error('Erro ao enviar e-mail de download:', error);
    throw error;
  }
}

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

    // Verificar se a chave do Resend está configurada
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY não configurada');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Configuração de e-mail incompleta' })
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
      email_status: 'pending' // Inicialmente pendente
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

    // Envio do e-mail
    let emailSuccess = false;
    let emailError = null;
    
    try {
      if (type === 'purchase') {
        await sendPurchaseEmail(submissionData);
      } else if (type === 'download') {
        await sendDownloadEmail(submissionData);
      }
      emailSuccess = true;
    } catch (mailErr) {
      console.error('Erro ao enviar e-mail:', mailErr);
      emailError = mailErr.message;
    }

    // Atualizar status do e-mail
    await supabase
      .from('submissions')
      .update({ 
        email_status: emailSuccess ? 'sent' : 'failed', 
        email_error: emailError 
      })
      .eq('id', result?.[0]?.id);

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
        emailSent: emailSuccess,
        emailError: emailError
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
