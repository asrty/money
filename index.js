const { input, text_attr, script, domReady, style } = require("@saltcorn/markup/tags");
const { getState } = require("@saltcorn/data/db/state");
const { sqlBinOp } = require("@saltcorn/data/plugin-helper");

const sql_name_function_allowed = !!sqlBinOp;

/**
 * Obtém o locale da requisição ou usa o padrão
 */
const getLocale = (req) => {
  return req && req.getLocale ? req.getLocale() : undefined;
};

/**
 * Configuração de estilos para animação de campos calculados
 
const ANIMATION_STYLES = `
  @keyframes money-pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.02); }
    100% { transform: scale(1); }
  }
  
  .money-calculated.animar {
    animation: money-pulse 0.3s ease-in-out;
    background-color: #e8f5e9 !important;
    transition: background-color 0.3s ease;
  }
  
  .money-calculated {
    transition: background-color 0.3s ease;
  }
`;*/

/**
 * Gera o script de formatação monetária em tempo real
 */
const generateFormatterScript = (id, locale, currency, decimalPoints) => {
  const scale = Math.pow(10, decimalPoints);
  
  return `
    (function() {
      const input = document.getElementById('${id}');
      if (!input) return;
      
      // Flag para evitar loops infinitos durante a formatação
      let isFormatting = false;
      
      input.addEventListener('input', (e) => {
        if (isFormatting) return;
        isFormatting = true;
        
        try {
          let value = e.target.value.replace(/\\D/g, '');
          
          if (value === '') {
            e.target.value = '';
            return;
          }

          const numValue = value / ${scale};
          ${isRawNumeric ? `
          e.target.value = numValue.toFixed(${decimalPoints}).replace('.', ',');
          ` : `
          e.target.value = numValue.toLocaleString('${locale}', {
            style: 'currency',
            currency: '${currency}',
            minimumFractionDigits: ${decimalPoints},
            maximumFractionDigits: ${decimalPoints}
          });
          `}
        } finally {
          isFormatting = false;
        }
      });
      
      // Formata o valor inicial se existir
      if (input.value) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })();
  `;
};


/**
 * Gera o script de cálculo automático para campos readonly com fórmula
 */
const generateCalculationScript = (id, formula, locale, currency, decimalPoints) => {
  return `
    (function() {
      if (!window.moneyCalculators) {
        window.moneyCalculators = new Set();
      }
      
      // Evita inicialização duplicada
      if (window.moneyCalculators.has('${id}')) return;
      window.moneyCalculators.add('${id}');
      
      const inputResultado = document.getElementById('${id}');
      if (!inputResultado) return;
      
      /**
       * Extrai o valor numérico de um campo formatado
       * @param {string} str - String formatada com moeda
       * @returns {number} - Valor numérico extraído
       */
      const parseMoneyValue = (str) => {
        if (!str || str === '') return 0;
        
        // Remove tudo exceto dígitos, vírgula, ponto e sinal negativo
        let cleaned = str
          .replace(/[^\\d,.-]/g, '')
          .replace(/\\.(?=.*,)/g, '')  // Remove pontos se houver vírgula (milhares)
          .replace(/,/g, '.');          // Converte vírgula decimal para ponto
        
        const result = parseFloat(cleaned);
        return isNaN(result) ? 0 : result;
      };
      
      /**
       * Anima o campo quando o valor é atualizado
       */
      const animateField = () => {
        inputResultado.classList.remove('animar');
        void inputResultado.offsetWidth; // Força reflow para reiniciar animação
        inputResultado.classList.add('animar');
        
        // Remove a classe após a animação
        setTimeout(() => {
          inputResultado.classList.remove('animar');
        }, 300);
      };
      
      /**
       * Calcula e atualiza o valor do campo baseado na fórmula
       */
      const updateCalculation = () => {
        try {
          let expression = \`${formula}\`;
          
          // Substitui referências de campos pelos seus valores
          document.querySelectorAll('[data-fieldname]').forEach(inp => {
            const fieldName = inp.dataset.fieldname;
            const value = parseMoneyValue(inp.value);
            
            // Substitui tanto {fieldname} quanto fieldname
            expression = expression.replace(
              new RegExp('\\\\{?' + fieldName + '\\\\}?', 'g'),
              value
            );
          });
          
          // Calcula o resultado
          const result = eval(expression);
          
          // Verifica se é um número válido
          if (isNaN(result) || !isFinite(result)) {
            console.warn('Cálculo resultou em valor inválido:', result);
            return;
          }
          
          // Formata o resultado
          ${isRawNumeric ? `
          const formatted = result.toFixed(${decimalPoints}).replace('.', ',');
          ` : `
          const formatted = result.toLocaleString('${locale}', {
            style: 'currency',
            currency: '${currency}',
            minimumFractionDigits: ${decimalPoints},
            maximumFractionDigits: ${decimalPoints}
          });
          `}
          
          // Atualiza apenas se o valor mudou
          const oldValue = inputResultado.value;
          if (formatted !== oldValue) {
            inputResultado.value = formatted;
            animateField();
          }
        } catch (error) {
          console.error('Erro ao calcular fórmula:', error);
          inputResultado.value = 'Erro no cálculo';
        }
      };
      
      // Adiciona listeners em todos os campos que podem afetar o cálculo
      const allInputs = document.querySelectorAll('[data-fieldname]');
      allInputs.forEach(inp => {
        // Remove listeners antigos para evitar duplicação
        inp.removeEventListener('input', updateCalculation);
        inp.removeEventListener('change', updateCalculation);
        
        // Adiciona novos listeners
        inp.addEventListener('input', updateCalculation);
        inp.addEventListener('change', updateCalculation);
      });
      
      // Executa o cálculo inicial
      setTimeout(updateCalculation, 100);
    })();
  `;
};

/**
 * Sanitiza e valida o CSS customizado
 */
const sanitizeCustomCSS = (css, id) => {
  if (!css || css.trim() === '') return '';
  
  // Substitui {$id} pelo ID real do campo
  let sanitized = css.replace(/\{\$id\}/g, id);
  
  // Adiciona escopo para evitar conflitos globais se não tiver
  if (!sanitized.includes(`.${id}`) && !sanitized.includes(`#${id}`)) {
    sanitized = `.${id} { ${sanitized} }`;
  }
  
  return sanitized;
};

/**
 * Definição do tipo Money
 */
const money = {
  name: "Money",
  
  sql_name: sql_name_function_allowed
    ? ({ decimal_points }) =>
        `decimal(${16 + (decimal_points || 2)}, ${+(decimal_points || 2)})`
    : "decimal(18,2)",

  fieldviews: {
    /**
     * Fieldview para exibição (somente leitura)
     */
    show: {
      configFields: (field) => {
        return [
          ...(!field?.attributes?.currency
            ? [
                {
                  type: "String",
                  name: "currency",
                  label: "Currency",
                  sublabel: "Optional. ISO 4217. Example: USD or EUR",
                },
              ]
            : []),
          ...(!field?.attributes?.decimal_points
            ? [
                {
                  label: "Decimal points",
                  name: "decimal_points",
                  type: "Integer",
                  default: 2,
                  required: true,
                  sublabel:
                    "Once set this cannot be changed. Number of fractional decimal points",
                },
              ]
            : []),
          {
            type: "String",
            name: "currencyDisplay",
            label: "Currency display",
            required: true,
            attributes: {
              options: ["symbol", "code", "narrowSymbol", "name"],
            },
          },
          {
            type: "String",
            name: "locale",
            label: "Locale override",
            sublabel: "Optional. Override field locale. Example: pt-BR, en-US",
          },
          // New boolean option - this is what you asked for
          {
            type: "Bool",
            name: "raw_numeric",
            label: "Raw numeric display",
            sublabel: "When checked, shows the pure number without currency symbol, separators or locale formatting (e.g. 1234.56 instead of R$ 1.234,56)",
            default: false,
          },
        ];
      },
      isEdit: false,
      run: (v, req, attrs = {}) => {
        const v1 = typeof v === "string" ? +v : v;
        

        // If raw_numeric is checked → return plain number
        if (attrs.raw_numeric === true) {
          if (v1 == null) return "";
          // Most common choices - pick one:
          return v1.toFixed(attrs.decimal_points || 2).replace('.', ',');                    // exact stored value (recommended)
          // OR: return v1.toFixed(attrs.decimal_points || 2);  // always 2 decimals
          // OR: return v1.toFixed(0);  // integer only
        }

        // Otherwise → original formatted version
        if (typeof v1 === "number") {
          const locale_ = attrs.locale || attrs.format_locale || getLocale(req) || "en";
          const decimalPoints = attrs.decimal_points || 2;
          return v1.toLocaleString(locale_, {
          style: attrs.currency ? "currency" : "decimal",
          currency: attrs.currency || undefined,
          currencyDisplay: attrs.currencyDisplay || "symbol",
          minimumFractionDigits: decimalPoints,
          maximumFractionDigits: decimalPoints,
        });
    } else return "";
  },
},

    /**
     * Fieldview para edição com formatação automática
     */
    edit: {
      configFields: () => [
        {
          type: "Bool",
          name: "readonly",
          label: "Readonly (Calculated field)",
          sublabel: "Make field display-only. Use with formula for automatic calculation.",
          default: false,
        },
        // New boolean - same as in show
        {
          type: "Bool",
          name: "raw_numeric",
          label: "Raw numeric initial display",
          sublabel: "When checked, shows the pure number without currency symbol, separators or locale formatting in the initial value (e.g. 1234.56 instead of R$ 1.234,56). Masking still works during typing.",
          default: false,
        },
        {
          input_type: "code",
          attributes: { mode: "application/javascript" },
          class: "validate-statements",
          name: "formula",
          label: "Calculation formula",
          sublabel: `JavaScript expression using other field names. Examples:
            • Simple: valor1 * valor2
            • With braces: {valor_total} - {desconto}
            • Complex: {preco} * {quantidade} * (1 - {desconto_percentual}/100)
            Leave empty to show field's own value.`,
          validator(s) {
            if (!s || s.trim() === '') return true;
            
            try {
              // Valida que é JavaScript válido
              new Function(s);
              return true;
            } catch (e) {
              return `Invalid JavaScript: ${e.message}`;
            }
          },
        },
        {
          input_type: "code",
          attributes: { mode: "text/css" },
          name: "csscode",
          label: "Custom CSS",
          sublabel: `Custom CSS for this field. Use {$id} as placeholder for field ID.
            Example: .{$id} { background-color: #f0f0f0; border: 2px solid #ccc; }`,
        },
      ],
      isEdit: true,
      run: (nm, v, attrs, cls, required, field) => {
        const id = `input${text_attr(nm)}`;
        const name = text_attr(nm);
        
        // Obtém configurações do campo (atributos do tipo)
        const locale_ = field.attributes?.locale || "en";
        const currency = field.attributes?.currency || "USD";
        const decimalPoints = field.attributes?.decimal_points || 2;
        
        // Obtém configurações do fieldview (attrs)
        const isReadonly = attrs.readonly || false;
        const isRawNumeric = attrs.raw_numeric || false;
        const formula = attrs.formula ? attrs.formula.trim() : '';
        const customCSS = sanitizeCustomCSS(attrs.csscode, id);
        const hasFormula = formula !== '';
        
        // Formata o valor inicial
        let initialValue = '';
        if (v !== null && v !== undefined && v !== '') {
          const numValue = typeof v === "string" ? parseFloat(v) : v;
          if (!isNaN(numValue)) {
            if (isRawNumeric) {
            // Raw mode: plain number, with fixed decimals if desired
            initialValue = numValue.toFixed(attrs.decimal_points || 2).replace('.', ',');
            // Alternative: initialValue = String(numValue); // exact stored value
          } else {
            // Formatted mode
            initialValue = numValue.toLocaleString(locale_, {
              style: 'currency',
              currency,
              minimumFractionDigits: decimalPoints,
              maximumFractionDigits: decimalPoints,
            });
          }
        }
      }
        
        // Cria o placeholder formatado
        const placeholder = isRawNumeric ? '0,00' : (0).toLocaleString(locale_, {
          style: 'currency',
          currency,
          minimumFractionDigits: decimalPoints,
          maximumFractionDigits: decimalPoints,
        });
        
        // Classes CSS adicionais
        /*const fieldClasses = [
          "form-control",
          cls,
          id,
          hasFormula ? "money-calculated" : ""
        ].filter(Boolean).join(" ");*/

        const fieldClasses = ["form-control", cls, id];
        
        // Gera o HTML do campo
        let html = input({
          type: "text",
          class: fieldClasses,
          "data-fieldname": text_attr(field.name),
          name,
          id,
          required: !!required,
          value: text_attr(initialValue),
          placeholder,
          readonly: isReadonly ? true : undefined  // For markup
        });
        /*
        // Adiciona estilos de animação se for campo calculado
        if (hasFormula) {
          html += style(ANIMATION_STYLES);
        }*/
        
        // Adiciona CSS customizado se fornecido
        if (customCSS) {
          html += style(customCSS);
        }
        
        // Adiciona scripts de formatação e cálculo
        html += script(
          domReady(`
            ${!isReadonly && !hasFormula ? generateFormatterScript(id, locale_, currency, decimalPoints) : ''}
            ${hasFormula ? generateCalculationScript(id, formula, locale_, currency, decimalPoints) : ''}
          `)
        );
        
        return html;
      },
    },
  },

  /**
   * Atributos do tipo (configurados ao criar o campo)
   */
  attributes: [
    {
      label: "Decimal points",
      name: "decimal_points",
      type: "Integer",
      default: 2,
      required: true,
      sublabel: "Number of decimal places (cannot be changed after creation)",
      attributes: { min: 0, max: 6 },
    },
    {
      type: "String",
      name: "currency",
      label: "Currency",
      sublabel: "ISO 4217 currency code. Example: BRL, USD, EUR",
      default: "USD",
      required: true,
    },
    {
      type: "String",
      name: "locale",
      label: "Locale",
      sublabel: "Formatting locale. Example: pt-BR, en-US, es-ES",
      default: "en",
      required: true,
    },
  ],

  /**
   * Converte valor do banco de dados para uso no sistema
   */
  readFromDB: (v) => {
    if (v === null || v === undefined) return null;
    return typeof v === "string" ? parseFloat(v) : v;
  },

  /**
   * Processa valor de formulários antes de salvar no banco
   */
  read: (v, attrs) => {
    // Valores nulos/undefined/vazios
    if (v === null || v === undefined || v === "") {
      return null;
    }
    
    // Já é número
    if (typeof v === "number") {
      return isNaN(v) ? null : v;
    }
    
    // String formatada - remove formatação
    if (typeof v === "string") {
      const cleaned = v
        .replace(/[^\d,.-]/g, '')          // Remove tudo exceto dígitos, vírgula, ponto e sinal
        .replace(/\.(?=.*,)/g, '')         // Remove pontos se houver vírgula (separador de milhares)
        .replace(/,/g, '.');               // Converte vírgula decimal para ponto
      
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }
    
    return null;
  },
};

module.exports = {
  sc_plugin_api_version: 1,
  types: [money],
  plugin_name: "money",
  description: "Money type with automatic formatting, calculation support, and customizable display",
};