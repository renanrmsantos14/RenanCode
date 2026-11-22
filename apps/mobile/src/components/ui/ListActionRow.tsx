import { AppActivityIndicator } from "./AppActivityIndicator";
import { ListRowLayout, type ListRowContentProps } from "./ListRowLayout";
import { RowPressable } from "./RowPressable";

export function ListActionRow(
  props: ListRowContentProps & {
    readonly tone?: "default" | "danger";
    readonly loading?: boolean;
    readonly onPress: () => void;
  },
) {
  const disabled = Boolean(props.disabled || props.loading);
  return (
    <RowPressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.description}
      accessibilityState={{ disabled, busy: Boolean(props.loading) }}
      disabled={disabled}
      onPress={props.onPress}
      className="bg-grouped-card"
    >
      <ListRowLayout
        {...props}
        disabled={disabled}
        accessory={
          props.loading ? (
            <AppActivityIndicator
              colorClassName={props.tone === "danger" ? "accent-danger-foreground" : "accent-icon"}
            />
          ) : undefined
        }
      />
    </RowPressable>
  );
}
