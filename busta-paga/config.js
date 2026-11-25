/* Busta Chiara · ajustes de negocio. Edita SOLO este archivo.
   PAY_LINK vacío = todo gratis (fase de pruebas). Cuando tengas el enlace de pago
   (Stripe Payment Link, PayPal...), pégalo aquí y el informe PDF pasa a ser de pago. */
window.BC_CONFIG = {
  APP_URL: "https://pronfutray.github.io/mi-app/busta-paga/",
  PAY_LINK: "",          // ej.: "https://buy.stripe.com/xxxxxxxx"
  PRICE: "2,99 €",
  COMMISSION: 30,        // % que ganan las embajadoras por cada pago con su enlace
  UNLOCK_HASH: "b96701026565ee2b9d498e8c8a8e741aa66f9587e42bbae4d72b17a04f80fd15"   // huella del código de desbloqueo (el código lo das tras el pago)
};
