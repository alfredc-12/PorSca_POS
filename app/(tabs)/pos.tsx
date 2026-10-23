import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiClientError } from '@/src/api/client';
import { Screen } from '@/src/components/Screen';
import { ProductThumbnail } from '@/src/components/ProductThumbnail';
import { usePos } from '@/src/context/PosContext';
import { DataState } from '@/src/components/DataState';
import { CartReviewSheet } from '@/src/components/CartReviewSheet';
import { CartRevalidation, cartSignature } from '@/src/domain/revalidation';
import { OFFLINE_COPY } from '@/src/config/offline';
import { PaymentMethod } from '@/src/types';
import { colors, radius, spacing, typography } from '@/src/theme/tokens';
import { useResponsive } from '@/src/hooks/useResponsive';
import { useDebouncedValue } from '@/src/hooks/useDebouncedValue';
import { stockStatus } from '@/src/utils/stockStatus';

/** Trailing debounce for search, so typing does not fire one request per keystroke. */
export const SEARCH_DEBOUNCE_MS = 280;

export default function PosScreen() {
  const {
    cart,
    cartUndo,
    total,
    addProductChecked,
    incrementProduct,
    decrementProduct,
    searchResults,
    catalogState,
    catalogError,
    searchProducts,
    clearCart,
    undoClearCart,
    beginCheckout,
    revalidateCart,
    replaceCartLines,
    demoCatalogEnabled,
    apiConfigured,
    recoverableCheckouts = [],
    checkoutRecoveryError,
    checkoutListState,
    activeCheckoutCount,
    retainedCheckoutId,
    authorityCheckout,
    checkoutProgress,
    canDiscardCorruptCheckout,
    hasUnreadableCheckoutIdentity,
    openPosCheckouts,
    parkSale,
  } = usePos();
  const [query, setQuery] = useState('');
  const [visibleResultCount, setVisibleResultCount] = useState(5);
  const changeQuery = (value: string) => {
    setVisibleResultCount(5);
    setQuery(value);
  };
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cartNotice, setCartNotice] = useState<string>();
  const [showParkPrompt, setShowParkPrompt] = useState(false);
  const [parkingSale, setParkingSale] = useState(false);
  const [review, setReview] = useState<CartRevalidation>();
  const [checkingPrices, setCheckingPrices] = useState(false);
  const responsive = useResponsive();
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const searchPending = query.trim() !== debouncedQuery.trim();

  const totalItems = cart.reduce((sum, line) => sum + line.quantity, 0);
  const matches = searchResults.slice(0, visibleResultCount);

  useEffect(() => {
    void searchProducts(debouncedQuery);
  }, [debouncedQuery, searchProducts]);

  useEffect(() => { void openPosCheckouts?.(); }, [openPosCheckouts]);

  const retrySearch = () => {
    void searchProducts(query);
  };

  /**
   * Every cart add goes through the same guarded path, and a rejected add is
   * answered in the cart instead of with a dialog the cashier has to dismiss
   * while a customer waits.
   */
  const addToCart = useCallback((productId: string) => {
    const result = incrementProduct(productId);
    setCartNotice(result.ok ? undefined : result.message);
    return result.ok;
  }, [incrementProduct]);

  const openCheckout = useCallback(() => {
    beginCheckout();
    router.push({ pathname: '/checkout', params: { method } });
  }, [beginCheckout, method]);

  const openConflictResolver = useCallback(() => {
    const id = retainedCheckoutId ?? authorityCheckout?.id ?? recoverableCheckouts[0]?.id;
    if (id) router.push({ pathname: '/checkout-conflict', params: { checkoutId: id } });
    else router.push('/sales-holds');
  }, [retainedCheckoutId, authorityCheckout?.id, recoverableCheckouts]);

  const confirmParkSale = useCallback(async () => {
    if (!cart.length || parkingSale) return;
    if (checkoutProgress?.basketDiverged) {
      setShowParkPrompt(false);
      openConflictResolver();
      return;
    }
    setParkingSale(true);
    setCartNotice(undefined);
    try {
      await parkSale();
      setShowParkPrompt(false);
      setCartNotice('Sale parked with the shop server. The POS cart is ready for the next customer.');
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'checkout_parked_basket_diverged') {
        setShowParkPrompt(false);
        setCartNotice('The sale was parked with the shop server. The edited cart was kept; review Sales/Holds before taking payment.');
      } else if (error instanceof ApiClientError && error.code === 'checkout_basket_diverged') {
        setShowParkPrompt(false);
        if (retainedCheckoutId) openConflictResolver();
        else setCartNotice('The cart changed while the sale was being saved. Review Sales/Holds before taking payment.');
      } else setCartNotice('The sale could not be parked with the shop server. The cart was kept; check Sales/Holds before taking payment.');
    } finally {
      setParkingSale(false);
    }
  }, [cart.length, parkingSale, checkoutProgress?.basketDiverged, openConflictResolver, parkSale, retainedCheckoutId]);

  /**
   * Proceed refuses a cart that diverged from the device's saved purchase and
   * routes the cashier to the conflict screen, so a second payable checkout
   * cannot be started for the same goods. Otherwise it re-reads the cart
   * against the catalog: a clean cart goes straight to checkout, and anything
   * that changed is shown in the review sheet so the cashier sees the delta
   * before Laravel recomputes the charge.
   */
  const proceed = useCallback(async () => {
    if (checkoutProgress?.basketDiverged) {
      openConflictResolver();
      return;
    }
    if (!cart.length || checkingPrices) return;
    // Strict online: a sale is only ever recorded by Laravel.
    if (!apiConfigured) {
      setCartNotice(OFFLINE_COPY.checkoutOffline);
      return;
    }
    setCartNotice(undefined);
    setCheckingPrices(true);
    try {
      const result = await revalidateCart();
      if (result.status === 'ready') {
        openCheckout();
        return;
      }
      if (result.status === 'offline' || result.status === 'unavailable') {
        setCartNotice(result.message);
        return;
      }
      setReview(result);
    } finally {
      setCheckingPrices(false);
    }
  }, [apiConfigured, cart.length, checkingPrices, openCheckout, revalidateCart, checkoutProgress?.basketDiverged, openConflictResolver]);

  const applyReview = useCallback(() => {
    if (!review) return;
    // The cart can be edited while the review sheet is open, and the revalidation
    // result only describes the cart it read. A stale review must never overwrite
    // a later edit or send an unvalidated cart to checkout (defect F2).
    if (review.cartSignature !== cartSignature(cart)) {
      setReview(undefined);
      void proceed();
      return;
    }
    replaceCartLines(review.appliedLines);
    setReview(undefined);
    openCheckout();
  }, [cart, openCheckout, proceed, replaceCartLines, review]);

  const productThumbSize = responsive.s(responsive.narrow ? 52 : 62);
  const needsStorageRecovery = hasUnreadableCheckoutIdentity || checkoutProgress?.recoveryFailure === 'identity' || canDiscardCorruptCheckout;

  return (
    <Screen>
      {needsStorageRecovery ? (
        <Pressable testID="pos-storage-recovery-card" accessibilityRole="button" accessibilityLabel="Open device storage recovery" onPress={() => router.push('/device-storage-recovery')} style={styles.recoveryAlertCard}>
          <Ionicons name="warning-outline" size={responsive.s(22)} color={colors.warning} />
          <View style={styles.recoveryCardCopy}>
            <Text style={styles.recoveryCardTitle}>Device storage needs recovery</Text>
            <Text style={styles.recoveryCardBody}>Review server discovery before clearing unreadable local data. Payment is not confirmed here.</Text>
          </View>
          <Ionicons name="chevron-forward" size={responsive.s(20)} color={colors.textMuted} />
        </Pressable>
      ) : null}
      <Pressable testID="pos-sales-holds-card" accessibilityRole="button" accessibilityLabel="Open Sales and Holds" onPress={() => router.push('/sales-holds')} style={styles.salesHoldsCard}>
        <View style={styles.salesHoldsCardIcon}><Ionicons name="archive-outline" size={responsive.s(22)} color={colors.primary} /></View>
        <View style={styles.recoveryCardCopy}>
          <Text style={styles.recoveryCardTitle}>Sales/Holds</Text>
          <Text style={styles.recoveryCardBody}>
            {checkoutListState === 'loading' ? 'Checking saved purchases…' : checkoutRecoveryError ? activeCheckoutCount ? `${activeCheckoutCount} active ${activeCheckoutCount === 1 ? 'purchase' : 'purchases'} need attention before another payment.` : 'A saved purchase needs attention.' : activeCheckoutCount ? `${activeCheckoutCount} active ${activeCheckoutCount === 1 ? 'purchase' : 'purchases'} • review before taking another payment.` : checkoutListState === 'unavailable' ? 'Saved purchases are unavailable. Retry in Sales/Holds before taking another payment.' : 'No active purchases. Open Sales/Holds to review saved purchase status.'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={responsive.s(20)} color={colors.textMuted} />
      </Pressable>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { minHeight: responsive.controlHeight }]}>
          <Ionicons name="search-outline" size={responsive.s(23)} color={colors.textMuted} />
          <TextInput
            testID="pos-search-input"
            accessibilityLabel="Search products"
            value={query}
            onChangeText={changeQuery}
            placeholder="Search product or scan barcode..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { fontSize: responsive.font(responsive.narrow ? 14 : 15.5) }]}
            returnKeyType="search"
          />
        </View>
        <Pressable
          style={[
            styles.scanButton,
            {
              minHeight: responsive.controlHeight,
              paddingHorizontal: responsive.narrow ? 13 : 17,
              minWidth: responsive.veryNarrow ? responsive.controlHeight : undefined,
            },
          ]}
          testID="pos-scan-button"
          accessibilityRole="button"
          accessibilityLabel="Scan product barcode"
          onPress={() => router.push('/scanner')}
        >
          <Ionicons name="barcode-outline" size={responsive.s(25)} color={colors.white} />
          {!responsive.veryNarrow ? <Text style={[styles.scanText, { fontSize: responsive.font(16) }]}>Scan</Text> : null}
        </Pressable>
      </View>

      <View style={[styles.statusLine, responsive.narrow && styles.statusLineNarrow]}>
        <View style={styles.statusCopy}>
          <Ionicons name="barcode-outline" size={responsive.s(19)} color={colors.primary} />
          <Text style={[styles.statusText, { fontSize: responsive.font(12.5) }]}>Scan a barcode or search for a product</Text>
        </View>
        <View style={styles.statusCopy}>
          <View style={styles.greenDot} />
          <Text style={[styles.statusText, { fontSize: responsive.font(12.5) }]}>{catalogState === 'unavailable' ? (demoCatalogEnabled ? 'Offline • Saved items' : 'Offline • Server required') : catalogState === 'loading' ? 'Checking…' : 'Catalog ready'}</Text>
        </View>
      </View>

      {(searchPending || (query.trim() && catalogState === 'loading')) ? (
        <DataState kind="loading" title="Searching the catalog" message="Checking current product and stock information." />
      ) : null}

      {query.trim() && catalogState === 'unavailable' ? (
        <DataState
          kind="unavailable"
          title="Shop server unavailable"
          message={catalogError ?? 'We cannot reach the shop server. Check the connection and try again.'}
          actionLabel="Retry search"
          onAction={retrySearch}
        />
      ) : null}

      {query.trim() && !searchPending && catalogState === 'ready' && matches.length === 0 ? (
        <DataState kind="no-results" title="No matching product" message="Try a different name or barcode." actionLabel="Clear search" onAction={() => changeQuery('')} />
      ) : null}

      {query.trim() && !searchPending && matches.length > 0 && catalogState !== 'loading' ? (
        <View style={[styles.resultsCard, { padding: responsive.narrow ? 10 : spacing.md }]}>
          <Text style={[styles.resultsTitle, { fontSize: responsive.font(typography.label) }]}>Search results</Text>
          {matches.map((product) => {
            const status = stockStatus(product);
            const outOfStock = status === 'out_of_stock';
            const stockLabel = status === 'out_of_stock' ? 'Out of stock' : status === 'low_stock' ? 'Low stock' : 'In stock';
            return (
              <Pressable
                key={product.id}
                testID="search-result"
                accessibilityRole="button"
                accessibilityLabel={`Add ${product.name}`}
                disabled={outOfStock}
                onPress={() => {
                  const result = addProductChecked(product);
                  if (result.ok) {
                    changeQuery('');
                    setCartNotice(undefined);
                  } else {
                    setCartNotice(result.message);
                  }
                }}
                style={({ pressed }) => [styles.resultRow, { minHeight: responsive.s(58) }, pressed && { opacity: 0.72 }]}
              >
                <ProductThumbnail product={product} size={responsive.s(responsive.narrow ? 40 : 44)} />
                <View style={styles.resultCopy}>
                  <Text style={[styles.productName, { fontSize: responsive.font(responsive.narrow ? 13.5 : 15.5) }]}>{product.name}</Text>
                  <Text testID="search-product-stock" style={[styles.meta, { fontSize: responsive.font(typography.caption) }]}>{stockLabel} ({product.stock}) • ₱{product.price.toFixed(2)}</Text>
                </View>
                <View style={[styles.addCircle, outOfStock && styles.addCircleDisabled, { width: responsive.s(34), height: responsive.s(34) }]}>
                  <Ionicons name="add" size={responsive.s(20)} color={outOfStock ? colors.textMuted : colors.white} />
                </View>
              </Pressable>
            );
          })}
          <Text accessibilityLiveRegion="polite" style={[styles.meta, { fontSize: responsive.font(typography.caption) }]}>
            Showing {matches.length} of {searchResults.length} matches
          </Text>
          {matches.length < searchResults.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show more products"
              onPress={() => setVisibleResultCount(count => count + 5)}
              style={styles.moreResults}
            >
              <Text style={styles.moreResultsText}>Show more</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.cartCard, { padding: responsive.narrow ? 10 : spacing.md }]}>
        <View style={[styles.cardHeader, { minHeight: responsive.s(44) }]}>
          <View style={styles.headingRow}>
            <Ionicons name="cart" size={responsive.s(26)} color={colors.primary} />
            <Text style={[styles.sectionTitle, { fontSize: responsive.font(responsive.narrow ? 19 : 21) }]}>Cart <Text style={styles.titleMuted}>({totalItems} {totalItems === 1 ? 'item' : 'items'})</Text></Text>
          </View>
          <View style={styles.cartActions}>
            <Pressable
              testID="pos-park-sale"
              disabled={!cart.length || !apiConfigured || parkingSale}
              accessibilityRole="button"
              accessibilityLabel="Park sale"
              onPress={() => {
                if (checkoutProgress?.basketDiverged) {
                  openConflictResolver();
                  return;
                }
                setShowParkPrompt(true);
              }}
              style={[styles.parkAction, (!cart.length || !apiConfigured || parkingSale) && styles.actionDisabled]}
            >
              <Ionicons name="archive-outline" size={responsive.s(19)} color={cart.length && apiConfigured ? colors.primary : colors.textMuted} />
              {!responsive.veryNarrow ? <Text style={[styles.parkText, (!cart.length || !apiConfigured) && styles.actionTextDisabled]}>Park Sale</Text> : null}
            </Pressable>
            <Pressable
              testID="pos-clear-cart"
              disabled={!cart.length}
              accessibilityRole="button"
              accessibilityLabel="Clear cart"
              onPress={() => {
                clearCart();
                setCartNotice(undefined);
              }}
              style={[styles.clearAction, !cart.length && styles.actionDisabled]}
            >
              <Ionicons name="trash-outline" size={responsive.s(20)} color={cart.length ? colors.danger : colors.textMuted} />
              {!responsive.veryNarrow ? <Text style={[styles.clearText, { fontSize: responsive.font(14) }, !cart.length && { color: colors.textMuted }]}>Clear All</Text> : null}
            </Pressable>
          </View>
        </View>

        {cartUndo ? (
          <View testID="cart-undo-banner" style={styles.undoBanner}>
            <Ionicons name="trash-outline" size={responsive.s(18)} color={colors.white} />
            <Text style={[styles.undoText, { fontSize: responsive.font(12.5) }]}>
              Cart cleared ({cartUndo.lineCount} {cartUndo.lineCount === 1 ? 'item' : 'items'})
            </Text>
            <Pressable
              testID="cart-undo-button"
              accessibilityRole="button"
              accessibilityLabel="Undo clear cart"
              onPress={() => {
                undoClearCart();
                setCartNotice(undefined);
              }}
              style={styles.undoAction}
            >
              <Text style={[styles.undoActionText, { fontSize: responsive.font(12.5) }]}>Undo</Text>
            </Pressable>
          </View>
        ) : cartNotice ? (
          <View testID="cart-limit-notice" accessibilityRole="alert" style={styles.limitNotice}>
            <Ionicons name="alert-circle-outline" size={responsive.s(19)} color={colors.warning} />
            <Text style={[styles.limitNoticeText, { fontSize: responsive.font(12.5) }]}>{cartNotice}</Text>
          </View>
        ) : null}

        {cart.length === 0 ? (
          <View style={[styles.emptyCart, { minHeight: responsive.heightValue(0.205, 145, 185), paddingHorizontal: responsive.narrow ? spacing.lg : spacing.xl }]}>
            <View style={[styles.emptyIcon, { width: responsive.s(58), height: responsive.s(58), borderRadius: responsive.s(18) }]}><Ionicons name="basket-outline" size={responsive.s(32)} color={colors.primary} /></View>
            <Text style={[styles.emptyTitle, { fontSize: responsive.font(typography.title) }]}>Your cart is ready for a new sale</Text>
            <Text style={[styles.emptyBody, { fontSize: responsive.font(typography.label) }]}>Scan a barcode or search for a product above to add the first item.</Text>
          </View>
        ) : cart.map((line, index) => (
          <View
            key={line.product.id}
            style={[
              styles.cartLine,
              index > 0 && styles.lineBorder,
              {
                minHeight: responsive.heightValue(0.13, 98, 118),
                gap: responsive.narrow ? 8 : spacing.md,
                paddingVertical: responsive.short ? 10 : spacing.md,
              },
            ]}
          >
            <ProductThumbnail product={line.product} size={productThumbSize} />
            <View style={styles.lineCopy}>
              <Text numberOfLines={2} style={[styles.productName, { fontSize: responsive.font(responsive.narrow ? 13.5 : 15.5) }]}>{line.product.name}</Text>
              <Text testID="cart-unit-price" style={[styles.meta, { fontSize: responsive.font(typography.caption) }]}>₱{line.product.price.toFixed(2)}</Text>
              <View style={styles.stockLine}><View style={styles.greenDotSmall} /><Text style={[styles.stockText, { fontSize: responsive.font(responsive.narrow ? 11 : 12.5) }]}>In stock ({line.product.stock})</Text></View>
            </View>
            <View style={[styles.lineRight, { minWidth: responsive.narrow ? 94 : 108, gap: responsive.short ? 7 : 10 }]}>
              <View style={[styles.qtyControl, { minHeight: responsive.s(38) }]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${line.product.name}`} style={[styles.qtyButton, { width: responsive.s(responsive.narrow ? 32 : 36), height: responsive.s(48) }]} onPress={() => decrementProduct(line.product.id)}><Text style={[styles.qtyText, { fontSize: responsive.font(20) }]}>−</Text></Pressable>
                <Text testID="cart-quantity" style={[styles.qtyNumber, { width: responsive.s(responsive.narrow ? 30 : 35), fontSize: responsive.font(16) }]}>{line.quantity}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Increase ${line.product.name}`}
                  style={[styles.qtyButton, { width: responsive.s(responsive.narrow ? 32 : 36), height: responsive.s(48) }]}
                  onPress={() => addToCart(line.product.id)}
                ><Text style={[styles.qtyText, { fontSize: responsive.font(20) }]}>+</Text></Pressable>
              </View>
              <Text testID="cart-line-total" style={[styles.amount, { fontSize: responsive.font(responsive.narrow ? 16 : 18) }]}>₱{(line.product.price * line.quantity).toFixed(2)}</Text>
            </View>
          </View>
        ))}

        <View style={[styles.summaryCard, { padding: responsive.narrow ? 10 : spacing.md, gap: responsive.short ? 8 : 11 }]}>
          <View style={styles.summaryRow}><View style={styles.summaryLabelRow}><Ionicons name="calculator-outline" size={responsive.s(19)} color={colors.primary} /><Text style={[styles.summaryLabel, { fontSize: responsive.font(responsive.narrow ? 13 : 14.5) }]}>Subtotal ({totalItems} items)</Text></View><Text testID="cart-subtotal" style={[styles.summaryValue, { fontSize: responsive.font(responsive.narrow ? 13 : 14.5) }]}>₱{total.toFixed(2)}</Text></View>
          <View style={styles.divider} />
          <View style={styles.totalRow}><Text style={[styles.totalLabel, { fontSize: responsive.font(responsive.narrow ? 21 : 23) }]}>Total</Text><Text testID="cart-total" style={[styles.totalValue, { fontSize: responsive.font(responsive.narrow ? 27 : 30) }]}>₱{total.toFixed(2)}</Text></View>
        </View>
      </View>

      <View style={[styles.paymentCard, { padding: responsive.narrow ? 10 : spacing.md, gap: responsive.short ? 10 : spacing.md }]}>
        <View style={styles.paymentHeader}>
          <View style={styles.headingRow}>
            <Ionicons name="card-outline" size={responsive.s(24)} color={colors.primary} />
            <Text style={[styles.paymentTitle, { fontSize: responsive.font(responsive.narrow ? 16 : typography.title) }]}>Payment Method</Text>
          </View>
          {!responsive.veryNarrow ? <Text style={[styles.selectText, { fontSize: responsive.font(typography.caption) }]}>Select a method</Text> : null}
        </View>
        <View style={[styles.paymentOptions, responsive.veryNarrow && styles.paymentOptionsStack]}>
          <PaymentOption testID="payment-cash" icon="cash-outline" label="Cash" selected={method === 'cash'} onPress={() => setMethod('cash')} />
          <PaymentOption testID="payment-qrph" icon="qr-code-outline" label="QR Ph / PayMongo" selected={method === 'qrph'} onPress={() => setMethod('qrph')} />
        </View>
        {!apiConfigured ? (
          <View testID="offline-checkout-notice" accessibilityRole="alert" style={styles.offlineNotice}>
            <Ionicons name="cloud-offline-outline" size={responsive.s(19)} color={colors.warning} />
            <Text style={[styles.offlineNoticeText, { fontSize: responsive.font(12.5) }]}>
              Connect to the shop server to complete a sale. The cart stays editable and nothing is recorded locally.
            </Text>
          </View>
        ) : null}
        <Pressable
          testID="proceed-to-payment"
          accessibilityRole="button"
          accessibilityLabel="Proceed to payment"
          disabled={!cart.length || checkingPrices || !apiConfigured}
          onPress={() => void proceed()}
          style={({ pressed }) => [
            styles.proceedButton,
            { minHeight: responsive.heightValue(0.071, 54, 62) },
            (!cart.length || checkingPrices || !apiConfigured) && styles.proceedDisabled,
            pressed && cart.length > 0 && apiConfigured && { opacity: 0.86 },
          ]}
        >
          <Ionicons name="lock-closed" size={responsive.s(20)} color={colors.white} />
          <Text style={[styles.proceedText, { fontSize: responsive.font(responsive.narrow ? 15 : 17) }]}>
            {checkingPrices ? 'Checking prices & stock…' : 'Proceed to Payment'}
          </Text>
          <Ionicons name="arrow-forward" size={responsive.s(23)} color={colors.white} />
        </Pressable>
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark" size={responsive.s(16)} color={colors.primary} />
          <Text style={[styles.secureText, { fontSize: responsive.font(10.5) }]}>Secure and trusted payments powered by</Text>
          <Ionicons name="ellipse" size={responsive.s(12)} color="#18A9C9" />
          <Text style={[styles.paymongo, { fontSize: responsive.font(11) }]}>PayMongo</Text>
        </View>
      </View>

      <CartReviewSheet
        visible={Boolean(review)}
        revalidation={review}
        onApply={applyReview}
        onDismiss={() => setReview(undefined)}
      />
      <Modal visible={showParkPrompt} transparent animationType="fade" onRequestClose={() => setShowParkPrompt(false)}>
        <KeyboardAvoidingView style={styles.parkBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.parkPrompt}>
            <Text style={styles.parkPromptTitle}>Park this sale?</Text>
            <Text style={styles.parkPromptBody}>The shop server will retain this checkout. The current cart will reset only after the save succeeds.</Text>
            <View style={styles.parkPromptActions}>
              <Pressable accessibilityRole="button" disabled={parkingSale} onPress={() => setShowParkPrompt(false)} style={styles.parkCancelButton}><Text style={styles.parkCancelText}>Keep editing</Text></Pressable>
              <Pressable testID="confirm-park-sale" accessibilityRole="button" disabled={!cart.length || !apiConfigured || parkingSale} onPress={() => void confirmParkSale()} style={[styles.parkConfirmButton, (!cart.length || !apiConfigured || parkingSale) && styles.actionDisabled]}><Text style={styles.parkConfirmText}>{parkingSale ? 'Saving…' : 'Park sale'}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function PaymentOption({ testID, icon, label, selected, onPress }: { testID: string; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; selected: boolean; onPress: () => void }) {
  const responsive = useResponsive();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.paymentOption,
        {
          flex: responsive.veryNarrow ? undefined : 1,
          width: responsive.veryNarrow ? '100%' : undefined,
          minHeight: responsive.s(58),
          paddingHorizontal: responsive.narrow ? 10 : spacing.md,
        },
        selected && styles.paymentOptionSelected,
      ]}
    >
      <Ionicons name={icon} size={responsive.s(23)} color={selected ? colors.primary : colors.text} />
      <Text numberOfLines={1} style={[styles.paymentOptionText, { fontSize: responsive.font(responsive.narrow ? 12 : 13.5) }]}>{label}</Text>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={responsive.s(23)} color={selected ? colors.primary : colors.outline} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchBox: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, paddingVertical: 0 },
  scanButton: { borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  scanText: { color: colors.white, fontWeight: '800' },
  statusLine: { marginTop: -8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  statusLineNarrow: { marginTop: -6, flexWrap: 'wrap' },
  statusCopy: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  statusText: { color: colors.textMuted, flexShrink: 1 },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  greenDotSmall: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  resultsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, gap: 4 },
  moreResults: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.md },
  moreResultsText: { color: colors.primary, fontWeight: '800' },
  resultsTitle: { color: colors.text, fontWeight: '800', marginBottom: 2 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.outline },
  resultCopy: { flex: 1 },
  addCircle: { borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addCircleDisabled: { backgroundColor: colors.surfaceMuted },
  cartCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: 3 },
  cartActions: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  parkAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  parkText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  actionDisabled: { opacity: 0.48 },
  actionTextDisabled: { color: colors.textMuted },
  salesHoldsCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.lg, backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  recoveryAlertCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: '#EBD28B', borderRadius: radius.lg, backgroundColor: colors.warningSoft },
  salesHoldsCardIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primarySoft },
  recoveryCardCopy: { flex: 1, minWidth: 0, gap: 3 },
  recoveryCardTitle: { color: colors.text, fontWeight: '900' },
  recoveryCardBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  parkBackdrop: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: '#10182788' },
  parkPrompt: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  parkPromptTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  parkPromptBody: { color: colors.textMuted, lineHeight: 21 },
  parkPromptActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  parkCancelButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  parkCancelText: { color: colors.text, fontWeight: '800' },
  parkConfirmButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primary },
  parkConfirmText: { color: colors.white, fontWeight: '900' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  sectionTitle: { color: colors.text, fontWeight: '900', letterSpacing: -0.4 },
  titleMuted: { color: colors.textMuted, fontWeight: '600' },
  clearAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, minHeight: 48, minWidth: 48 },
  clearText: { color: colors.danger, fontWeight: '800' },
  limitNotice: { marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft, paddingHorizontal: spacing.md, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  limitNoticeText: { color: colors.text, flex: 1, lineHeight: 18, fontWeight: '600' },
  offlineNotice: { marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft, paddingHorizontal: spacing.md, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  offlineNoticeText: { color: colors.text, flex: 1, lineHeight: 18, fontWeight: '600' },
  undoBanner: { marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.text, paddingHorizontal: spacing.md, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  undoText: { color: colors.white, flex: 1, fontWeight: '700' },
  undoAction: { minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  undoActionText: { color: colors.white, fontWeight: '900' },
  emptyCart: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIcon: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  cartLine: { flexDirection: 'row', alignItems: 'center' },
  lineBorder: { borderTopWidth: 1, borderTopColor: colors.outline },
  lineCopy: { flex: 1, minWidth: 0, gap: 3 },
  productName: { color: colors.text, fontWeight: '800' },
  meta: { color: colors.textMuted, marginTop: 2 },
  stockLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stockText: { color: colors.success, fontWeight: '600' },
  lineRight: { alignItems: 'flex-end' },
  qtyControl: { borderRadius: 12, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', minHeight: 48 },
  qtyButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  qtyText: { color: colors.text, fontWeight: '700' },
  qtyNumber: { textAlign: 'center', color: colors.text, fontWeight: '800' },
  amount: { color: colors.text, fontWeight: '900' },
  summaryCard: { marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryWash, overflow: 'hidden' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { color: colors.textMuted, fontWeight: '600' },
  summaryValue: { color: colors.text, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.outline, marginTop: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  totalLabel: { color: colors.text, fontWeight: '900' },
  totalValue: { color: colors.primary, fontWeight: '900', letterSpacing: -0.8 },
  paymentCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  paymentTitle: { color: colors.text, fontWeight: '900' },
  selectText: { color: colors.primary, fontWeight: '700' },
  paymentOptions: { flexDirection: 'row', gap: spacing.sm },
  paymentOptionsStack: { flexDirection: 'column' },
  paymentOption: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryWash },
  paymentOptionText: { flex: 1, minWidth: 0, color: colors.text, fontWeight: '700' },
  proceedButton: { borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: colors.shadow, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  proceedDisabled: { opacity: 0.42 },
  proceedText: { color: colors.white, fontWeight: '900' },
  secureRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, flexWrap: 'wrap' },
  secureText: { color: colors.textMuted },
  paymongo: { color: colors.text, fontWeight: '800' },
});
