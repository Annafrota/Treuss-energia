const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  console.log('Função save-submission iniciada');
  
  // Log das variáveis de ambiente (exceto a chave por segurança)
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'Definida' : 'Não definida');
  console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'Definida' : 'Não definida');

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    console.log('Dados recebidos:', JSON.stringify(data));
    
    if (!data.type || !data.email || !data.name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Campos obrigatórios faltando' })
      };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    // Verificação mais detalhada
    if (!supabaseUrl) {
      console.error('SUPABASE_URL não está definida');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Configuração do servidor incompleta: SUPABASE_URL faltando' })
      };
    }
    
    if (!supabaseKey) {
      console.error('SUPABASE_SERVICE_KEY não está definida');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Configuração do servidor incompleta: SUPABASE_SERVICE_KEY faltando' })
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Cliente Supabase criado com sucesso');

    const submissionData = {
      type: data.type,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      quantity: data.quantity ? parseInt(data.quantity) : null,
      contribution: data.contribution ? parseFloat(data.contribution) : null,
      created_at: new Date().toISOString()
    };

    console.log('Dados para inserção:', submissionData);

    const { data: result, error } = await supabase
      .from('submissions')
      .insert([submissionData]);

    if (error) {
      console.error('Erro do Supabase:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Erro ao salvar dados',
          details: error.message 
        })
      };
    }

    console.log('Dados inseridos com sucesso:', result);
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: 'Dados salvos com sucesso',
        data: result
      })
    };
  } catch (error) {
    console.error('Erro na função:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erro interno do servidor',
        details: error.message 
      })
    };
  }
};

