import assert from "node:assert/strict";
import test from "node:test";
import { CENTRAL_FRETE_IMPORT } from "../data/central-frete-import.ts";
import {
  calculateSaleFinancials,
  weightedMarginBasisPoints,
} from "../lib/domain/finance.ts";
import {
  calculateDestinationArrivalDate,
  COST_CATEGORIES,
  FIXED_COST_ROWS,
  isEditableOperationCostCategory,
  isIcmsCostCategory,
  isOperationPaymentCategory,
  normalizeCostCategory,
  OPERATIONAL_STATUSES,
} from "../lib/domain/operations.ts";
import {
  operationalCommissionCents,
  sellerCommissionCents,
} from "../lib/domain/commissions.ts";
import { roleCan } from "../lib/domain/permissions.ts";
import {
  createPasswordCredential,
  createUserSessionToken,
  LOCAL_SESSION_COOKIE,
  validateInitialPassword,
  verifyLocalSession,
  verifyPassword,
} from "../lib/server/local-session.ts";

const AS_OF = "2026-08-18";

test("reconcilia integralmente as três vendas de agosto", () => {
  const calculated = CENTRAL_FRETE_IMPORT.sales.map((sale) =>
    calculateSaleFinancials({
      freightAmountCents: sale.freightAmountCents,
      commissionBasisPoints: sale.commissionBasisPoints,
      expenseAmountsCents: sale.costs.map((cost) => cost[1]),
      transactions: [
        {
          type: "ADIANTAMENTO",
          status: "CONFIRMADO",
          amountCents: sale.advance.amountCents,
        },
      ],
      dueDate: sale.dueDate,
      asOfDate: AS_OF,
    }),
  );

  assert.equal(
    CENTRAL_FRETE_IMPORT.sales.reduce(
      (sum, sale) => sum + sale.freightAmountCents,
      0,
    ),
    795_000,
  );
  assert.equal(
    calculated.reduce((sum, sale) => sum + sale.transportCostCents, 0),
    556_450,
  );
  assert.equal(
    calculated.reduce((sum, sale) => sum + sale.marginCents, 0),
    238_550,
  );
  assert.equal(
    weightedMarginBasisPoints(
      calculated.map((sale, index) => ({
        freightAmountCents:
          CENTRAL_FRETE_IMPORT.sales[index].freightAmountCents,
        marginCents: sale.marginCents,
      })),
    ),
    3001,
  );
  assert.equal(
    calculated.reduce((sum, sale) => sum + sale.totalReceivedCents, 0),
    485_000,
  );
  assert.equal(
    calculated.reduce((sum, sale) => sum + sale.balanceCents, 0),
    310_000,
  );
  assert.deepEqual(
    calculated.map((sale) => sale.status),
    ["VENCIDO", "PAGO", "VENCIDO"],
  );
});

test("reconcilia a venda de R$ 4.100,00", () => {
  const sale = CENTRAL_FRETE_IMPORT.sales[0];
  const result = calculateSaleFinancials({
    freightAmountCents: sale.freightAmountCents,
    commissionBasisPoints: sale.commissionBasisPoints,
    expenseAmountsCents: sale.costs.map((cost) => cost[1]),
    transactions: [
      {
        type: "ADIANTAMENTO",
        status: "CONFIRMADO",
        amountCents: sale.advance.amountCents,
      },
    ],
    dueDate: sale.dueDate,
    asOfDate: AS_OF,
  });
  assert.deepEqual(
    {
      commission: result.commissionCents,
      cost: result.transportCostCents,
      margin: result.marginCents,
      marginBps: result.marginBasisPoints,
      balance: result.balanceCents,
    },
    {
      commission: 28_700,
      cost: 302_900,
      margin: 107_100,
      marginBps: 2612,
      balance: 210_000,
    },
  );
});

test("ignora pagamento pendente e classifica pagamento parcial pela data", () => {
  const result = calculateSaleFinancials({
    freightAmountCents: 100_000,
    commissionBasisPoints: 0,
    expenseAmountsCents: [],
    transactions: [
      { type: "RECEBIMENTO", status: "CONFIRMADO", amountCents: 40_000 },
      { type: "RECEBIMENTO", status: "PENDENTE", amountCents: 60_000 },
    ],
    dueDate: "2026-08-30",
    asOfDate: AS_OF,
  });
  assert.equal(result.totalReceivedCents, 40_000);
  assert.equal(result.balanceCents, 60_000);
  assert.equal(result.isPartial, true);
  assert.equal(result.status, "EM_ABERTO");
});

test("estorno é transação inversa e não apaga o original", () => {
  const result = calculateSaleFinancials({
    freightAmountCents: 100_000,
    commissionBasisPoints: 0,
    expenseAmountsCents: [],
    transactions: [
      { type: "RECEBIMENTO", status: "CONFIRMADO", amountCents: 100_000 },
      { type: "ESTORNO", status: "CONFIRMADO", amountCents: 100_000 },
    ],
    dueDate: "2026-08-15",
    asOfDate: AS_OF,
  });
  assert.equal(result.totalReceivedCents, 0);
  assert.equal(result.balanceCents, 100_000);
  assert.equal(result.status, "VENCIDO");
});

test("pagamento maior vira crédito e nunca saldo negativo", () => {
  const result = calculateSaleFinancials({
    freightAmountCents: 100_000,
    commissionBasisPoints: 0,
    expenseAmountsCents: [],
    transactions: [
      { type: "RECEBIMENTO", status: "CONFIRMADO", amountCents: 125_000 },
    ],
    dueDate: "2026-08-30",
    asOfDate: AS_OF,
  });
  assert.equal(result.balanceCents, 0);
  assert.equal(result.customerCreditCents, 25_000);
  assert.equal(result.status, "PAGO");
});

test("matriz de permissões separa gerência, vendedor e financeiro", () => {
  assert.equal(roleCan("ADMIN", "IMPORT_DATA"), true);
  assert.equal(roleCan("GERENCIA", "MANAGE_PAYMENTS"), false);
  assert.equal(roleCan("VENDEDOR", "MANAGE_SALES"), true);
  assert.equal(roleCan("VENDEDOR", "MANAGE_PAYMENTS"), false);
  assert.equal(roleCan("FINANCEIRO", "MANAGE_PAYMENTS"), true);
  assert.equal(roleCan("FINANCEIRO", "MANAGE_USERS"), false);
});

test("usa somente os seis status operacionais definidos", () => {
  assert.deepEqual(OPERATIONAL_STATUSES, [
    "CONFIRMAR",
    "AGUARDANDO REEMBARQUE",
    "EM VIAGEM",
    "FINALIZADO",
    "PÁTIO DE APOIO",
    "PÁTIO CENTRAL",
  ]);
});

test("mantém somente ICMS na interface e oferece três prestadores", () => {
  assert.equal(FIXED_COST_ROWS.length, 11);
  assert.deepEqual(
    FIXED_COST_ROWS
      .filter((row) => ["ICMS", "CTE_MDFE"].includes(row.category))
      .map((row) => row.category),
    ["ICMS"],
  );
  assert.equal(
    FIXED_COST_ROWS.filter((row) => row.category === "PRESTADOR_SERVICO")
      .length,
    3,
  );
  assert.deepEqual(
    FIXED_COST_ROWS.slice(3, 7).map((row) => row.category),
    ["COLETA_ORIGEM", "ENTREGA_DESTINO", "PATIO_ORIGEM", "PATIO_DESTINO"],
  );
  assert.equal(isIcmsCostCategory("CTE_MDFE"), true);
  assert.equal(normalizeCostCategory("CTE_MDFE"), "ICMS");
  assert.equal(normalizeCostCategory("ICMS_CTE_MDFE"), "ICMS");
  assert.ok(COST_CATEGORIES.includes("CTE_MDFE"));
  assert.ok(COST_CATEGORIES.includes("CTE"));
  assert.ok(COST_CATEGORIES.includes("MDFE"));
  assert.ok(COST_CATEGORIES.includes("ICMS_CTE_MDFE"));
});

test("classifica coleta e entrega no painel de pagamentos da operação", () => {
  assert.equal(isOperationPaymentCategory("COLETA_ORIGEM"), true);
  assert.equal(isOperationPaymentCategory("ENTREGA_DESTINO"), true);
  assert.equal(isOperationPaymentCategory("PATIO_ORIGEM"), false);
  assert.equal(isOperationPaymentCategory("PRESTADOR_SERVICO"), false);
  assert.equal(isEditableOperationCostCategory("COLETA_ORIGEM"), true);
  assert.equal(isEditableOperationCostCategory("ENTREGA_DESTINO"), true);
  assert.equal(isEditableOperationCostCategory("PATIO_ORIGEM"), true);
  assert.equal(isEditableOperationCostCategory("PATIO_DESTINO"), true);
  assert.equal(isEditableOperationCostCategory("ICMS"), true);
  assert.equal(isEditableOperationCostCategory("SEGURO_ALLIANZ"), true);
});

test("protege login por usuário e senha com sessão assinada", async () => {
  const previousPassword = process.env.CENTRAL_FRETE_PASSWORD;
  const previousSecret = process.env.CENTRAL_FRETE_SESSION_SECRET;
  delete process.env.CENTRAL_FRETE_PASSWORD;
  delete process.env.CENTRAL_FRETE_SESSION_SECRET;
  try {
    assert.equal(await validateInitialPassword("central123"), true);
    assert.equal(await validateInitialPassword("senha-incorreta"), false);
    const credential = await createPasswordCredential("senha123");
    assert.equal(
      await verifyPassword("senha123", credential.passwordSalt, credential.passwordHash),
      true,
    );
    assert.equal(
      await verifyPassword("outra-senha", credential.passwordSalt, credential.passwordHash),
      false,
    );
    const token = await createUserSessionToken({
      id: "admin-id",
      email: "admin@centralfrete.local",
      username: "admin",
      name: "ADMINISTRADOR",
    });
    const request = new Request("http://localhost/api/me", {
      headers: { cookie: `${LOCAL_SESSION_COOKIE}=${token}` },
    });
    const session = await verifyLocalSession(request);
    assert.equal(session?.email, "admin@centralfrete.local");
    assert.equal(session?.username, "admin");
    assert.equal(session?.userId, "admin-id");
    const tampered = new Request("http://localhost/api/me", {
      headers: { cookie: `${LOCAL_SESSION_COOKIE}=${token}x` },
    });
    assert.equal(await verifyLocalSession(tampered), null);
  } finally {
    if (previousPassword === undefined) delete process.env.CENTRAL_FRETE_PASSWORD;
    else process.env.CENTRAL_FRETE_PASSWORD = previousPassword;
    if (previousSecret === undefined) delete process.env.CENTRAL_FRETE_SESSION_SECRET;
    else process.env.CENTRAL_FRETE_SESSION_SECRET = previousSecret;
  }
});

test("calcula a chegada pelo dia de entrada e prazo operacional", () => {
  assert.equal(calculateDestinationArrivalDate("2026-08-18", 5), "2026-08-23");
  assert.equal(calculateDestinationArrivalDate("2026-08-30", 4), "2026-09-03");
  assert.equal(calculateDestinationArrivalDate("", 4), "");
  assert.equal(calculateDestinationArrivalDate("2026-08-18", 0), "");
});

test("calcula as comissões fixas de vendedor e setor operacional", () => {
  assert.equal(sellerCommissionCents(100_000), 7_000);
  assert.equal(operationalCommissionCents(100_000), 3_000);
});
