const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // Só processa requisições POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse dos dados recebidos
    const data = JSON.parse(event.body);
    
    // Conecta ao Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    
    // Insere os dados na tabela
    const { error } = await supabase
      .from('submissions')
      .insert([
        {
          type: data.type,
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          quantity: data.quantity || null,
          contribution: data.contribution || null,
          created_at: new Date()
        }
      ]);
    
    if (error) {
      throw error;
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Dados salvos com sucesso!' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
