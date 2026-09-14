import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import type { AssistantContext } from "./PurchaseAssistant";

const defaultContext: AssistantContext = {
  product: null,
  kind: "unlinked",
  exclude_household: true,
  recent_only: true,
};
type Request = {
  context: AssistantContext;
  productName: string | null;
  revision: number;
};
type AssistantState = {
  opened: boolean;
  mounted: boolean;
  request: Request;
  focusRevision: number;
  open: (context?: AssistantContext, productName?: string | null) => void;
  close: () => void;
};
const Context = createContext<AssistantState | null>(null);
export function useAssistant() {
  const state = useContext(Context);
  if (!state) throw new Error("Assistant context is missing");
  return state;
}
export function AssistantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [opened, setOpened] = useState(
    () =>
      location.pathname === "/" &&
      window.matchMedia("(min-width: 1300px)").matches,
  );
  const [mounted, setMounted] = useState(opened);
  const visitedOverview = useRef(location.pathname === "/");
  useEffect(() => {
    if (location.pathname !== "/" || visitedOverview.current) return;
    visitedOverview.current = true;
    if (window.matchMedia("(min-width: 1300px)").matches) {
      setOpened(true);
      setMounted(true);
    }
  }, [location.pathname]);
  const [focusRevision, setFocusRevision] = useState(0);
  const [request, setRequest] = useState<Request>({
    context: defaultContext,
    productName: null,
    revision: 0,
  });
  return (
    <Context.Provider
      value={{
        opened,
        mounted,
        request,
        focusRevision,
        open: (context, productName) => {
          if (context)
            setRequest((old) =>
              JSON.stringify(old.context) === JSON.stringify(context)
                ? old
                : {
                    context,
                    productName: productName ?? null,
                    revision: old.revision + 1,
                  },
            );
          setMounted(true);
          setOpened(true);
          setFocusRevision((old) => old + 1);
        },
        close: () => setOpened(false),
      }}
    >
      {children}
    </Context.Provider>
  );
}
