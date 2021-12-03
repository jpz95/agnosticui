(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.agnosticsvelte = {}));
})(this, (function (exports) { 'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function compute_rest_props(props, keys) {
        const rest = {};
        keys = new Set(keys);
        for (const k in props)
            if (!keys.has(k) && k[0] !== '$')
                rest[k] = props[k];
        return rest;
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached
        const children = target.childNodes;
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            if (node !== target.actual_end_child) {
                target.insertBefore(node, target.actual_end_child);
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append(target, node);
        }
        else if (node.parentNode !== target || node.nextSibling != anchor) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function set_attributes(node, attributes) {
        // @ts-ignore
        const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
        for (const key in attributes) {
            if (attributes[key] == null) {
                node.removeAttribute(key);
            }
            else if (key === 'style') {
                node.style.cssText = attributes[key];
            }
            else if (key === '__value') {
                node.value = node[key] = attributes[key];
            }
            else if (descriptors[key] && descriptors[key].set) {
                node[key] = attributes[key];
            }
            else {
                attr(node, key, attributes[key]);
            }
        }
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function select_option(select, value) {
        for (let i = 0; i < select.options.length; i += 1) {
            const option = select.options[i];
            if (option.__value === value) {
                option.selected = true;
                return;
            }
        }
    }
    function select_value(select) {
        const selected_option = select.querySelector(':checked') || select.options[0];
        return selected_option && selected_option.__value;
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            // @ts-ignore
            callbacks.slice().forEach(fn => fn.call(this, event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src/stories/Alert.svelte generated by Svelte v3.39.0 */

    function add_css$k() {
    	var style = element("style");
    	style.id = "svelte-28gbnq-style";
    	style.textContent = ".alert-base.svelte-28gbnq,.alert.svelte-28gbnq{display:flex;flex-direction:row;align-items:center;justify-content:flex-start}.alert-end.svelte-28gbnq{justify-content:flex-end}.alert-skin.svelte-28gbnq,.alert.svelte-28gbnq{padding:var(--agnostic-side-padding);background:var(--agnostic-gray-light)}.alert-icon.svelte-28gbnq{color:var(--agnostic-gray-mid-dark);margin-inline-end:var(--fluid-8);flex:0 0 var(--fluid-24)}.alert-border-top.svelte-28gbnq{border-top:var(--fluid-8) solid var(--agnostic-gray-mid-dark)}.alert-border-left.svelte-28gbnq{border-left:var(--fluid-8) solid var(--agnostic-gray-mid-dark)}.alert-border-bottom.svelte-28gbnq{border-bottom:var(--fluid-8) solid var(--agnostic-gray-mid-dark)}.alert-border-right.svelte-28gbnq{border-right:var(--fluid-8) solid var(--agnostic-gray-mid-dark)}.alert-border-all.svelte-28gbnq{border:var(--fluid-2) solid var(--agnostic-gray-mid-dark)}.alert-rounded.svelte-28gbnq{border-radius:var(--agnostic-alert-radius, var(--agnostic-radius, 0.25rem))}.alert-warning.svelte-28gbnq{background:var(--agnostic-warning-light);color:var(--agnostic-warning-dark)}.alert-warning-icon.svelte-28gbnq{color:var(--agnostic-warning-border-accent);margin-inline-end:var(--fluid-8);flex:0 0 var(--fluid-24)}.alert-warning.alert-border-top.svelte-28gbnq{border-top-color:var(--agnostic-warning-border-accent)}.alert-warning.alert-border-left.svelte-28gbnq{border-left-color:var(--agnostic-warning-border-accent)}.alert-warning.alert-border-bottom.svelte-28gbnq{border-bottom-color:var(--agnostic-warning-border-accent)}.alert-warning.alert-border-right.svelte-28gbnq{border-right-color:var(--agnostic-warning-border-accent)}.alert-warning.alert-border-all.svelte-28gbnq{border:var(--fluid-2) solid var(--agnostic-warning-border)}.alert-info.svelte-28gbnq{background:var(--agnostic-primary-light);color:var(--agnostic-primary-dark)}.alert-info-icon.svelte-28gbnq{color:var(--agnostic-primary-dark);margin-inline-end:var(--fluid-8);flex:0 0 var(--fluid-24)}.alert-info.alert-border-top.svelte-28gbnq{border-top-color:var(--agnostic-primary-dark)}.alert-info.alert-border-left.svelte-28gbnq{border-left-color:var(--agnostic-primary-dark)}.alert-info.alert-border-bottom.svelte-28gbnq{border-bottom-color:var(--agnostic-primary-dark)}.alert-info.alert-border-right.svelte-28gbnq{border-right-color:var(--agnostic-primary-dark)}.alert-info.alert-border-all.svelte-28gbnq{border:var(--fluid-2) solid var(--agnostic-primary-border)}.alert-error.svelte-28gbnq{background:var(--agnostic-error-light);color:var(--agnostic-error-dark)}.alert-error-icon.svelte-28gbnq{color:var(--agnostic-error-dark);margin-inline-end:var(--fluid-8);flex:0 0 var(--fluid-24)}.alert-error.alert-border-top.svelte-28gbnq{border-top-color:var(--agnostic-error-dark)}.alert-error.alert-border-left.svelte-28gbnq{border-left-color:var(--agnostic-error-dark)}.alert-error.alert-border-bottom.svelte-28gbnq{border-bottom-color:var(--agnostic-error-dark)}.alert-error.alert-border-right.svelte-28gbnq{border-right-color:var(--agnostic-error-dark)}.alert-error.alert-border-all.svelte-28gbnq{border:var(--fluid-2) solid var(--agnostic-error-border)}.alert-success.svelte-28gbnq{background:var(--agnostic-action-light);color:var(--agnostic-action-from)}.alert-success-icon.svelte-28gbnq{color:var(--agnostic-ation-from);margin-inline-end:var(--fluid-8);flex:0 0 var(--fluid-24)}.alert-success.alert-border-top.svelte-28gbnq{border-top-color:var(--agnostic-action-from)}.alert-success.alert-border-left.svelte-28gbnq{border-left-color:var(--agnostic-action-from)}.alert-success.alert-border-bottom.svelte-28gbnq{border-bottom-color:var(--agnostic-action-from)}.alert-success.alert-border-right.svelte-28gbnq{border-right-color:var(--agnostic-action-from)}.alert-success.alert-border-all.svelte-28gbnq{border:var(--fluid-2) solid var(--agnostic-action-border)}";
    	append(document.head, style);
    }

    function create_fragment$k(ctx) {
    	let div;
    	let svg;
    	let path0;
    	let path1;
    	let t;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[11].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[10], null);

    	return {
    		c() {
    			div = element("div");
    			svg = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			t = space();
    			if (default_slot) default_slot.c();
    			attr(path0, "d", "M0 0h24v24H0z");
    			attr(path0, "fill", "none");
    			attr(path1, "fill", "currentColor");
    			attr(path1, "d", "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z");
    			attr(svg, "class", "alert-icon " + /*svgModifierClass*/ ctx[1] + " svelte-28gbnq");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "height", "24");
    			attr(svg, "viewBox", "0 0 24 24");
    			attr(svg, "width", "24");
    			attr(div, "class", "" + (null_to_empty(/*classes*/ ctx[0]) + " svelte-28gbnq"));
    			attr(div, "role", "alert");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, svg);
    			append(svg, path0);
    			append(svg, path1);
    			append(div, t);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 1024)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[10], !current ? -1 : dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$k($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { isRounded = false } = $$props;
    	let { isBorderAll = false } = $$props;
    	let { isBorderLeft = false } = $$props;
    	let { isBorderRight = false } = $$props;
    	let { isBorderTop = false } = $$props;
    	let { isBorderBottom = false } = $$props;
    	let { isBlockEnd = false } = $$props;
    	let { type = "" } = $$props;
    	let typeClass;

    	switch (type) {
    		case "warning":
    			typeClass = "alert-warning";
    			break;
    		case "error":
    			typeClass = "alert-error";
    			break;
    		case "info":
    			typeClass = "alert-info";
    			break;
    		case "success":
    			typeClass = "alert-success";
    			break;
    		default:
    			typeClass = "";
    	}

    	const classes = [
    		"alert",
    		typeClass,
    		isRounded ? "alert-rounded" : "",
    		isBorderAll ? "alert-border-all" : "",
    		isBorderLeft ? "alert-border-left" : "",
    		isBorderRight ? "alert-border-right" : "",
    		isBorderTop ? "alert-border-top" : "",
    		isBorderBottom ? "alert-border-bottom" : "",
    		isBlockEnd ? "alert-end" : ""
    	].filter(klass => klass.length).join(" ");

    	const svgModifierClass = type ? `alert-${type}-icon` : "";

    	$$self.$$set = $$props => {
    		if ('isRounded' in $$props) $$invalidate(2, isRounded = $$props.isRounded);
    		if ('isBorderAll' in $$props) $$invalidate(3, isBorderAll = $$props.isBorderAll);
    		if ('isBorderLeft' in $$props) $$invalidate(4, isBorderLeft = $$props.isBorderLeft);
    		if ('isBorderRight' in $$props) $$invalidate(5, isBorderRight = $$props.isBorderRight);
    		if ('isBorderTop' in $$props) $$invalidate(6, isBorderTop = $$props.isBorderTop);
    		if ('isBorderBottom' in $$props) $$invalidate(7, isBorderBottom = $$props.isBorderBottom);
    		if ('isBlockEnd' in $$props) $$invalidate(8, isBlockEnd = $$props.isBlockEnd);
    		if ('type' in $$props) $$invalidate(9, type = $$props.type);
    		if ('$$scope' in $$props) $$invalidate(10, $$scope = $$props.$$scope);
    	};

    	return [
    		classes,
    		svgModifierClass,
    		isRounded,
    		isBorderAll,
    		isBorderLeft,
    		isBorderRight,
    		isBorderTop,
    		isBorderBottom,
    		isBlockEnd,
    		type,
    		$$scope,
    		slots
    	];
    }

    class Alert extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-28gbnq-style")) add_css$k();

    		init(this, options, instance$k, create_fragment$k, safe_not_equal, {
    			isRounded: 2,
    			isBorderAll: 3,
    			isBorderLeft: 4,
    			isBorderRight: 5,
    			isBorderTop: 6,
    			isBorderBottom: 7,
    			isBlockEnd: 8,
    			type: 9
    		});
    	}
    }

    var Alert$1 = Alert;

    /* src/stories/Avatar.svelte generated by Svelte v3.39.0 */

    function add_css$j() {
    	var style = element("style");
    	style.id = "svelte-cu8319-style";
    	style.textContent = ".avatar.svelte-cu8319,.avatar-base.svelte-cu8319{position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:hidden}.avatar.svelte-cu8319,.avatar-skin.svelte-cu8319{width:var(--fluid-40);height:var(--fluid-40);max-width:100%;background:var(--agnostic-gray-extra-light);border-radius:50%}.avatar-square.svelte-cu8319{border-radius:0}.avatar-rounded.svelte-cu8319{border-radius:var(--agnostic-radius)}.avatar-small.svelte-cu8319{font-size:var(--fluid-12);width:var(--fluid-32);height:var(--fluid-32)}.avatar-large.svelte-cu8319{width:var(--fluid-48);height:var(--fluid-48)}.avatar-xlarge.svelte-cu8319{font-size:var(--fluid-20);width:var(--fluid-64);height:var(--fluid-64)}.avatar.svelte-cu8319::before{content:attr(data-text)}.avatar-image.svelte-cu8319{width:100%;height:100%;object-fit:cover}.avatar-info.svelte-cu8319{background:var(--agnostic-primary-light);color:var(--agnostic-primary-dark)}.avatar-warning.svelte-cu8319{background:var(--agnostic-warning-light);color:var(--agnostic-warning-dark)}.avatar-success.svelte-cu8319{background:var(--agnostic-action-light);color:var(--agnostic-action-from)}.avatar-error.svelte-cu8319{background:var(--agnostic-error-light);color:var(--agnostic-error-dark)}.avatar-transparent.svelte-cu8319{background:transparent}.avatar-group.svelte-cu8319{display:flex;flex-direction:row}";
    	append(document.head, style);
    }

    // (125:2) {#if imgUrl}
    function create_if_block$6(ctx) {
    	let img;
    	let img_src_value;

    	return {
    		c() {
    			img = element("img");
    			if (img.src !== (img_src_value = /*imgUrl*/ ctx[1])) attr(img, "src", img_src_value);
    			attr(img, "class", "avatar-image svelte-cu8319");
    			attr(img, "alt", "");
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*imgUrl*/ 2 && img.src !== (img_src_value = /*imgUrl*/ ctx[1])) {
    				attr(img, "src", img_src_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    function create_fragment$j(ctx) {
    	let span;
    	let t;
    	let span_data_text_value;
    	let current;
    	let if_block = /*imgUrl*/ ctx[1] && create_if_block$6(ctx);
    	const default_slot_template = /*#slots*/ ctx[9].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);

    	return {
    		c() {
    			span = element("span");
    			if (if_block) if_block.c();
    			t = space();
    			if (default_slot) default_slot.c();
    			attr(span, "class", "" + (null_to_empty(/*avatarClasses*/ ctx[2]) + " svelte-cu8319"));
    			attr(span, "data-text", span_data_text_value = /*text*/ ctx[0] || null);
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			if (if_block) if_block.m(span, null);
    			append(span, t);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*imgUrl*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$6(ctx);
    					if_block.c();
    					if_block.m(span, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 256)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[8], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*text*/ 1 && span_data_text_value !== (span_data_text_value = /*text*/ ctx[0] || null)) {
    				attr(span, "data-text", span_data_text_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (if_block) if_block.d();
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$j($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { isRounded = false } = $$props;
    	let { isTransparent = false } = $$props;
    	let { isSquare = false } = $$props;
    	let { type = [] } = $$props;
    	let { size = [] } = $$props;
    	let { text = "" } = $$props;
    	let { imgUrl = "" } = $$props;

    	const avatarClasses = [
    		"avatar",
    		isRounded ? "avatar-rounded" : "",
    		isTransparent ? "avatar-transparent" : "",
    		isSquare ? "avatar-square" : "",
    		type ? `avatar-${type}` : "",
    		size ? `avatar-${size}` : ""
    	].filter(cls => cls).join(" ");

    	$$self.$$set = $$props => {
    		if ('isRounded' in $$props) $$invalidate(3, isRounded = $$props.isRounded);
    		if ('isTransparent' in $$props) $$invalidate(4, isTransparent = $$props.isTransparent);
    		if ('isSquare' in $$props) $$invalidate(5, isSquare = $$props.isSquare);
    		if ('type' in $$props) $$invalidate(6, type = $$props.type);
    		if ('size' in $$props) $$invalidate(7, size = $$props.size);
    		if ('text' in $$props) $$invalidate(0, text = $$props.text);
    		if ('imgUrl' in $$props) $$invalidate(1, imgUrl = $$props.imgUrl);
    		if ('$$scope' in $$props) $$invalidate(8, $$scope = $$props.$$scope);
    	};

    	return [
    		text,
    		imgUrl,
    		avatarClasses,
    		isRounded,
    		isTransparent,
    		isSquare,
    		type,
    		size,
    		$$scope,
    		slots
    	];
    }

    class Avatar extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-cu8319-style")) add_css$j();

    		init(this, options, instance$j, create_fragment$j, safe_not_equal, {
    			isRounded: 3,
    			isTransparent: 4,
    			isSquare: 5,
    			type: 6,
    			size: 7,
    			text: 0,
    			imgUrl: 1
    		});
    	}
    }

    var Avatar$1 = Avatar;

    /* src/stories/AvatarGroup.svelte generated by Svelte v3.39.0 */

    function add_css$i() {
    	var style = element("style");
    	style.id = "svelte-1e2muvj-style";
    	style.textContent = ".avatar-group.svelte-1e2muvj{display:flex;flex-direction:row}.avatar-group.svelte-1e2muvj>span{border:2px solid white}.avatar-group.svelte-1e2muvj>span:not(:first-child){margin-inline-start:calc(-1 * var(--fluid-10))}";
    	append(document.head, style);
    }

    function create_fragment$i(ctx) {
    	let div;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[1].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[0], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", "avatar-group svelte-1e2muvj");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 1)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[0], !current ? -1 : dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$i($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;

    	$$self.$$set = $$props => {
    		if ('$$scope' in $$props) $$invalidate(0, $$scope = $$props.$$scope);
    	};

    	return [$$scope, slots];
    }

    class AvatarGroup extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1e2muvj-style")) add_css$i();
    		init(this, options, instance$i, create_fragment$i, safe_not_equal, {});
    	}
    }

    var AvatarGroup$1 = AvatarGroup;

    /* src/stories/Breadcrumb.svelte generated by Svelte v3.39.0 */

    function add_css$h() {
    	var style = element("style");
    	style.id = "svelte-1px6q7a-style";
    	style.textContent = ".breadcrumb.svelte-1px6q7a.svelte-1px6q7a.svelte-1px6q7a{display:flex;flex-wrap:wrap;padding:0;white-space:nowrap;list-style:none}.breadcrumb-item.svelte-1px6q7a+.breadcrumb-item.svelte-1px6q7a.svelte-1px6q7a{padding-inline-start:var(--fluid-6)}.breadcrumb-item.svelte-1px6q7a+.breadcrumb-item.svelte-1px6q7a.svelte-1px6q7a::before{padding-inline-end:var(--fluid-6);color:var(--agnostic-gray-mid-dark);content:\"\\203A\"}.breadcrumb-item.active.svelte-1px6q7a.svelte-1px6q7a.svelte-1px6q7a{color:var(--agnostic-dark)}.breadcrumb-slash.svelte-1px6q7a .breadcrumb-item.svelte-1px6q7a+.breadcrumb-item.svelte-1px6q7a::before{content:\"\\0002f\"}.breadcrumb-arrow.svelte-1px6q7a .breadcrumb-item.svelte-1px6q7a+.breadcrumb-item.svelte-1px6q7a::before{content:\"\\02192\"}.breadcrumb-bullet.svelte-1px6q7a .breadcrumb-item.svelte-1px6q7a+.breadcrumb-item.svelte-1px6q7a::before{content:\"\\02022\"}";
    	append(document.head, style);
    }

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	child_ctx[7] = i;
    	return child_ctx;
    }

    // (64:8) {:else}
    function create_else_block$3(ctx) {
    	let span;
    	let t_value = /*route*/ ctx[5].label + "";
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(t_value);
    			attr(span, "v-else", "");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*routes*/ 1 && t_value !== (t_value = /*route*/ ctx[5].label + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (62:8) {#if !isLast(i) && route.url}
    function create_if_block$5(ctx) {
    	let a;
    	let t_value = /*route*/ ctx[5].label + "";
    	let t;
    	let a_href_value;

    	return {
    		c() {
    			a = element("a");
    			t = text(t_value);
    			attr(a, "href", a_href_value = /*route*/ ctx[5].url);
    		},
    		m(target, anchor) {
    			insert(target, a, anchor);
    			append(a, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*routes*/ 1 && t_value !== (t_value = /*route*/ ctx[5].label + "")) set_data(t, t_value);

    			if (dirty & /*routes*/ 1 && a_href_value !== (a_href_value = /*route*/ ctx[5].url)) {
    				attr(a, "href", a_href_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(a);
    		}
    	};
    }

    // (60:4) {#each routes as route, i}
    function create_each_block$3(ctx) {
    	let li;
    	let show_if;
    	let t;
    	let li_class_value;

    	function select_block_type(ctx, dirty) {
    		if (show_if == null || dirty & /*routes*/ 1) show_if = !!(!/*isLast*/ ctx[2](/*i*/ ctx[7]) && /*route*/ ctx[5].url);
    		if (show_if) return create_if_block$5;
    		return create_else_block$3;
    	}

    	let current_block_type = select_block_type(ctx, -1);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			li = element("li");
    			if_block.c();
    			t = space();
    			attr(li, "class", li_class_value = "" + (null_to_empty(/*crumbClasses*/ ctx[3](/*i*/ ctx[7])) + " svelte-1px6q7a"));
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);
    			if_block.m(li, null);
    			append(li, t);
    		},
    		p(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx, dirty)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(li, t);
    				}
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if_block.d();
    		}
    	};
    }

    function create_fragment$h(ctx) {
    	let nav;
    	let ol;
    	let each_value = /*routes*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	return {
    		c() {
    			nav = element("nav");
    			ol = element("ol");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(ol, "class", "" + (null_to_empty(/*breadcrumbClasses*/ ctx[1]) + " svelte-1px6q7a"));
    			attr(nav, "aria-label", "breadcrumbs");
    		},
    		m(target, anchor) {
    			insert(target, nav, anchor);
    			append(nav, ol);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ol, null);
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*crumbClasses, routes, isLast*/ 13) {
    				each_value = /*routes*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(ol, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(nav);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$h($$self, $$props, $$invalidate) {
    	let { routes = [] } = $$props;
    	let { type = "" } = $$props;
    	const breadcrumbClasses = ["breadcrumb", type ? `breadcrumb-${type}` : ""].filter(cls => cls).join(" ");

    	const isLast = idx => {
    		return idx === routes.length - 1;
    	};

    	const crumbClasses = index => {
    		const isLastCrumb = isLast(routes);
    		return ["breadcrumb-item", isLastCrumb ? "active" : ""].filter(cl => cl).join(" ");
    	};

    	$$self.$$set = $$props => {
    		if ('routes' in $$props) $$invalidate(0, routes = $$props.routes);
    		if ('type' in $$props) $$invalidate(4, type = $$props.type);
    	};

    	return [routes, breadcrumbClasses, isLast, crumbClasses, type];
    }

    class Breadcrumb extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1px6q7a-style")) add_css$h();
    		init(this, options, instance$h, create_fragment$h, safe_not_equal, { routes: 0, type: 4 });
    	}
    }

    var Breadcrumb$1 = Breadcrumb;

    /* src/stories/Button.svelte generated by Svelte v3.39.0 */

    function add_css$g() {
    	var style = element("style");
    	style.id = "svelte-euuw53-style";
    	style.textContent = ".btn-base.svelte-euuw53,.btn.svelte-euuw53{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;user-select:none;appearance:none;cursor:pointer;box-sizing:border-box;transition-property:all;transition-duration:var(--agnostic-timing-medium)}.btn-skin.svelte-euuw53,.btn.svelte-euuw53{color:var(--agnostic-btn-font-color, var(--agnostic-dark));background-color:var(--agnostic-btn-bgcolor, var(--agnostic-gray-light));border-color:var(--agnostic-btn-bgcolor, var(--agnostic-gray-light));border-style:solid;border-width:var(--agnostic-btn-border-size, 1px);font-family:var(--agnostic-btn-font-family, var(--agnostic-font-family));font-weight:var(--agnostic-btn-font-weight, 400);font-size:var(--agnostic-btn-font-size, 1rem);line-height:var(--agnostic-line-height, var(--fluid-20, 1.25rem));padding-block-start:var(--agnostic-vertical-pad, 0.5rem);padding-block-end:var(--agnostic-vertical-pad, 0.5rem);padding-inline-start:var(--agnostic-side-padding, 0.75rem);padding-inline-end:var(--agnostic-side-padding, 0.75rem);text-decoration:none;text-align:center;outline:none}.btn.svelte-euuw53:visited{color:var(--agnostic-btn-font-color, var(--agnostic-dark))}.btn.svelte-euuw53:hover{opacity:85%;text-decoration:none}.btn.svelte-euuw53:active{text-shadow:0 1px 0 rgb(255 255 255 / 30%);text-decoration:none;transition-duration:0s;box-shadow:inset 0 1px 3px rgb(0 0 0 / 20%)}.btn.svelte-euuw53:focus{box-shadow:0 0 0 var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-color);outline:var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-outline-style)\n    var(--agnostic-focus-ring-outline-color);transition:box-shadow var(--agnostic-timing-fast) ease-out}.btn.disabled.svelte-euuw53,.btn.svelte-euuw53:disabled{top:0 !important;background:var(--agnostic-btn-disabled-bg, var(--agnostic-gray-mid-dark)) !important;text-shadow:0 1px 1px rgb(255 255 255 / 100%) !important;border-color:transparent;color:var(--agnostic-btn-disabled-color, var(--agnostic-gray-dark)) !important;cursor:default !important;appearance:none !important;box-shadow:none !important;opacity:80% !important}.btn-primary.svelte-euuw53{background-color:var(--agnostic-btn-primary, var(--agnostic-primary));border-color:var(--agnostic-btn-primary, var(--agnostic-primary));color:var(--agnostic-btn-primary-color, var(--agnostic-light))}.btn-primary.btn-bordered.svelte-euuw53{color:var(--agnostic-btn-primary, var(--agnostic-primary))}.btn-primary.btn-bordered.svelte-euuw53:hover,.btn-primary.btn-bordered.svelte-euuw53:focus{background-color:var(--agnostic-btn-primary, var(--agnostic-primary));color:var(--agnostic-btn-primary-color, var(--agnostic-light))}.btn-primary.svelte-euuw53:visited{color:var(--agnostic-btn-primary-color, var(--agnostic-light))}.btn-secondary.svelte-euuw53{background-color:var(--agnostic-btn-secondary, var(--agnostic-secondary));border-color:var(--agnostic-btn-secondary, var(--agnostic-secondary));color:var(--agnostic-btn-secondary-color, var(--agnostic-light))}.btn-secondary.btn-bordered.svelte-euuw53{color:var(--agnostic-btn-secondary, var(--agnostic-secondary))}.btn-secondary.btn-bordered.svelte-euuw53:hover,.btn-secondary.btn-bordered.svelte-euuw53:focus{background-color:var(--agnostic-btn-secondary, var(--agnostic-secondary));color:var(--agnostic-btn-secondary-color, var(--agnostic-light))}.btn-secondary.svelte-euuw53:visited{color:var(--agnostic-btn-secondary-color, var(--agnostic-light))}.btn-raised.svelte-euuw53{border-color:var(--agnostic-btn-bgcolor, var(--agnostic-gray-light));border-style:solid;background:-webkit-gradient(linear, left top, left bottom, from(#f6f6f6), to(#e1e1e1));background:linear-gradient(\n      var(--agnostic-btn-raised-from, var(--agnostic-gray-mid)),\n      var(--agnostic-btn-raised-to, var(--agnostic-gray-extra-light))\n    );box-shadow:inset 0 1px 0 rgb(255 255 255 / 30%), 0 1px 2px rgb(0 0 0 / 15%)}.btn-raised.svelte-euuw53:hover,.btn-raised.svelte-euuw53:focus{background:-webkit-gradient(linear, left top, left bottom, from(white), to(gainsboro));background:linear-gradient(to bottom, white, gainsboro)}.btn-raised.active.svelte-euuw53{background:#eee;box-shadow:inset 0 1px 3px rgb(0 0 0 / 20%), 0 1px 0 white}.btn-raised.btn-primary.svelte-euuw53{border-color:var(--agnostic-btn-primary-raised-to, var(--agnostic-primary-from));background:-webkit-gradient(\n      linear,\n      left top,\n      left bottom,\n      from(var(--agnostic-btn-primary-raised-from, var(--agnostic-primary-from))),\n      to(var(--agnostic-btn-primary-raised-to, var(--agnostic-primary-to)))\n    );background:linear-gradient(\n      var(--agnostic-btn-primary-raised-from, var(--agnostic-primary-from)),\n      var(--agnostic-btn-primary-raised-to, var(--agnostic-primary-to))\n    )}.btn-raised.btn-primary.svelte-euuw53:hover,.btn-raised.btn-primary.svelte-euuw53:focus{background:linear-gradient(\n      to bottom,\n      var(--agnostic-btn-primary-raised-hover-from, var(--agnostic-primary-hover)),\n      var(--agnostic-btn-primary-raised-to, var(--agnostic-primary-from))\n    );background:-webkit-gradient(\n      linear,\n      left top,\n      left bottom,\n      from(var(--agnostic-btn-primary-raised-hover-from, var(--agnostic-primary-hover))),\n      to(var(--agnostic-btn-primary-raised-to, var(--agnostic-primary-from)))\n    );background:linear-gradient(\n      var(--agnostic-btn-primary-raised-hover-from, var(--agnostic-primary-hover)),\n      var(--agnostic-btn-primary-raised-to, var(--agnostic-primary-from))\n    )}.btn-raised.btn-primary.svelte-euuw53:active,.btn-raised.btn-primary.active.svelte-euuw53{opacity:90%;box-shadow:0 0 0 1px rgb(0 0 0 / 30%)}.btn-raised.btn-secondary.svelte-euuw53{border-color:var(--agnostic-btn-secondary-raised-to, var(--agnostic-secondary-to));background:-webkit-gradient(\n      linear,\n      left top,\n      left bottom,\n      from(var(--agnostic-btn-secondary-raised-from, var(--agnostic-secondary-from))),\n      to(var(--agnostic-btn-secondary-raised-to, var(--agnostic-secondary-to)))\n    );background:linear-gradient(\n      var(--agnostic-btn-secondary-raised-from, var(--agnostic-secondary-from)),\n      var(--agnostic-btn-secondary-raised-to, var(--agnostic-secondary-to))\n    )}.btn-raised.btn-secondary.svelte-euuw53:hover,.btn-raised.btn-secondary.svelte-euuw53:focus{background:linear-gradient(\n      to bottom,\n      var(--agnostic-btn-secondary-raised-hover-from, var(--agnostic-secondary-hover)),\n      var(--agnostic-btn-secondary-raised-to, var(--agnostic-secondary-to))\n    );background:-webkit-gradient(\n      linear,\n      left top,\n      left bottom,\n      from(var(--agnostic-btn-secondary-raised-hover-from, var(--agnostic-secondary-hover))),\n      to(var(--agnostic-btn-secondary-raised-to, var(--agnostic-secondary-to)))\n    );background:linear-gradient(\n      var(--agnostic-btn-secondary-raised-hover-from, var(--agnostic-secondary-hover)),\n      var(--agnostic-btn-secondary-raised-to, var(--agnostic-secondary-to))\n    )}.btn-raised.btn-secondary.svelte-euuw53:active,.btn-raised.btn-secondary.active.svelte-euuw53{opacity:90%;box-shadow:0 0 0 1px rgb(0 0 0 / 30%)}.btn-bordered.svelte-euuw53{border-width:1px;background:transparent}.btn-large.svelte-euuw53{font-size:calc(var(--agnostic-btn-font-size, 1rem) + 0.25rem);height:3rem;line-height:3rem;padding:0 3rem}.btn-small.svelte-euuw53{font-size:calc(var(--agnostic-btn-font-size, 1rem) - 0.25rem);height:2rem;line-height:2rem;padding:0 2rem}.btn-rounded.svelte-euuw53{border-radius:var(--agnostic-btn-radius, var(--agnostic-radius, 0.25rem))}.btn-pill.svelte-euuw53{border-radius:200px}.btn-circle.svelte-euuw53{border-radius:100%;width:2.5rem;height:2.5rem;padding:0 !important}.btn-circle-large.svelte-euuw53{font-size:calc(var(--agnostic-btn-font-size, 1rem) + 0.25rem);width:3rem;height:3rem}.btn-circle-small.svelte-euuw53{font-size:calc(var(--agnostic-btn-font-size, 1rem) - 0.25rem);width:2rem;height:2rem}.btn-block.svelte-euuw53{width:100%}.btn-block-following.svelte-euuw53{margin-block-start:-1px}.btn-link.svelte-euuw53,.btn-blank.svelte-euuw53{font-family:var(--agnostic-btn-font-family, var(--agnostic-font-family));font-size:var(--agnostic-btn-font-size, 1rem);background-color:transparent;border:0;border-radius:0;box-shadow:none;transition:none}.btn-link.svelte-euuw53{color:var(--agnostic-btn-primary, var(--agnostic-primary))}.btn-link.svelte-euuw53:hover{cursor:pointer}@media(prefers-reduced-motion){.btn.svelte-euuw53,.btn-blank.svelte-euuw53,.btn.svelte-euuw53:focus{transition-duration:0.001ms !important}}";
    	append(document.head, style);
    }

    // (447:0) {:else}
    function create_else_block$2(ctx) {
    	let button;
    	let button_class_value;
    	let button_tab_index_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[19].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[18], null);

    	return {
    		c() {
    			button = element("button");
    			if (default_slot) default_slot.c();
    			attr(button, "type", /*type*/ ctx[5]);
    			attr(button, "class", button_class_value = "" + (null_to_empty(/*klasses*/ ctx[6]) + " svelte-euuw53"));
    			attr(button, "role", /*role*/ ctx[1]);
    			attr(button, "aria-selected", /*ariaSelected*/ ctx[2]);
    			attr(button, "aria-controls", /*ariaControls*/ ctx[3]);

    			attr(button, "tab-index", button_tab_index_value = /*tabIndex*/ ctx[4] !== undefined
    			? /*tabIndex*/ ctx[4]
    			: null);

    			button.disabled = /*isDisabled*/ ctx[0];
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);

    			if (default_slot) {
    				default_slot.m(button, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(button, "keydown", /*keydown_handler*/ ctx[20]),
    					listen(button, "click", /*click_handler*/ ctx[21]),
    					listen(button, "focus", /*focus_handler*/ ctx[22]),
    					listen(button, "blur", /*blur_handler*/ ctx[23])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 262144)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[18], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*type*/ 32) {
    				attr(button, "type", /*type*/ ctx[5]);
    			}

    			if (!current || dirty & /*klasses*/ 64 && button_class_value !== (button_class_value = "" + (null_to_empty(/*klasses*/ ctx[6]) + " svelte-euuw53"))) {
    				attr(button, "class", button_class_value);
    			}

    			if (!current || dirty & /*role*/ 2) {
    				attr(button, "role", /*role*/ ctx[1]);
    			}

    			if (!current || dirty & /*ariaSelected*/ 4) {
    				attr(button, "aria-selected", /*ariaSelected*/ ctx[2]);
    			}

    			if (!current || dirty & /*ariaControls*/ 8) {
    				attr(button, "aria-controls", /*ariaControls*/ ctx[3]);
    			}

    			if (!current || dirty & /*tabIndex*/ 16 && button_tab_index_value !== (button_tab_index_value = /*tabIndex*/ ctx[4] !== undefined
    			? /*tabIndex*/ ctx[4]
    			: null)) {
    				attr(button, "tab-index", button_tab_index_value);
    			}

    			if (!current || dirty & /*isDisabled*/ 1) {
    				button.disabled = /*isDisabled*/ ctx[0];
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (443:0) {#if type === 'faux'}
    function create_if_block$4(ctx) {
    	let div;
    	let div_class_value;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[19].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[18], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", div_class_value = "" + (null_to_empty(/*klasses*/ ctx[6]) + " svelte-euuw53"));
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 262144)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[18], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*klasses*/ 64 && div_class_value !== (div_class_value = "" + (null_to_empty(/*klasses*/ ctx[6]) + " svelte-euuw53"))) {
    				attr(div, "class", div_class_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function create_fragment$g(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$4, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*type*/ ctx[5] === 'faux') return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$g($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { mode = "" } = $$props;
    	let { size = "" } = $$props;
    	let { isBordered = false } = $$props;
    	let { isBlock = false } = $$props;
    	let { isLink = false } = $$props;
    	let { isBlank = false } = $$props;
    	let { isDisabled = undefined } = $$props;
    	let { role = undefined } = $$props;
    	let { isRaised = false } = $$props;
    	let { isCircle = false } = $$props;
    	let { isRounded = false } = $$props;
    	let { isSkinned = true } = $$props;
    	let { ariaSelected = undefined } = $$props;
    	let { ariaControls = undefined } = $$props;
    	let { tabIndex = undefined } = $$props;
    	let { css = "" } = $$props;
    	let { type = "button" } = $$props;

    	// ******************** HEY! ************************
    	// You will need to also add these to the buttonslot:
    	// agnostic-svelte/src/stories/ButtonSlot.svelte
    	let klasses = [
    		isSkinned ? "btn" : "btn-base",
    		mode ? `btn-${mode}` : "",
    		size ? `btn-${size}` : "",
    		isBordered ? "btn-bordered" : "",
    		isBlock ? "btn-block" : "",
    		isCircle ? "btn-circle" : "",
    		isRounded ? "btn-rounded" : "",
    		isDisabled ? "disabled" : "",
    		isRaised ? "btn-raised" : "",
    		isBlank ? "btn-blank" : "",
    		isLink ? "btn-link" : "",
    		css ? `${css}` : ""
    	];

    	klasses = klasses.filter(klass => klass.length);
    	klasses = klasses.join(" ");

    	function keydown_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function blur_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ('mode' in $$props) $$invalidate(7, mode = $$props.mode);
    		if ('size' in $$props) $$invalidate(8, size = $$props.size);
    		if ('isBordered' in $$props) $$invalidate(9, isBordered = $$props.isBordered);
    		if ('isBlock' in $$props) $$invalidate(10, isBlock = $$props.isBlock);
    		if ('isLink' in $$props) $$invalidate(11, isLink = $$props.isLink);
    		if ('isBlank' in $$props) $$invalidate(12, isBlank = $$props.isBlank);
    		if ('isDisabled' in $$props) $$invalidate(0, isDisabled = $$props.isDisabled);
    		if ('role' in $$props) $$invalidate(1, role = $$props.role);
    		if ('isRaised' in $$props) $$invalidate(13, isRaised = $$props.isRaised);
    		if ('isCircle' in $$props) $$invalidate(14, isCircle = $$props.isCircle);
    		if ('isRounded' in $$props) $$invalidate(15, isRounded = $$props.isRounded);
    		if ('isSkinned' in $$props) $$invalidate(16, isSkinned = $$props.isSkinned);
    		if ('ariaSelected' in $$props) $$invalidate(2, ariaSelected = $$props.ariaSelected);
    		if ('ariaControls' in $$props) $$invalidate(3, ariaControls = $$props.ariaControls);
    		if ('tabIndex' in $$props) $$invalidate(4, tabIndex = $$props.tabIndex);
    		if ('css' in $$props) $$invalidate(17, css = $$props.css);
    		if ('type' in $$props) $$invalidate(5, type = $$props.type);
    		if ('$$scope' in $$props) $$invalidate(18, $$scope = $$props.$$scope);
    	};

    	return [
    		isDisabled,
    		role,
    		ariaSelected,
    		ariaControls,
    		tabIndex,
    		type,
    		klasses,
    		mode,
    		size,
    		isBordered,
    		isBlock,
    		isLink,
    		isBlank,
    		isRaised,
    		isCircle,
    		isRounded,
    		isSkinned,
    		css,
    		$$scope,
    		slots,
    		keydown_handler,
    		click_handler,
    		focus_handler,
    		blur_handler
    	];
    }

    class Button extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-euuw53-style")) add_css$g();

    		init(this, options, instance$g, create_fragment$g, safe_not_equal, {
    			mode: 7,
    			size: 8,
    			isBordered: 9,
    			isBlock: 10,
    			isLink: 11,
    			isBlank: 12,
    			isDisabled: 0,
    			role: 1,
    			isRaised: 13,
    			isCircle: 14,
    			isRounded: 15,
    			isSkinned: 16,
    			ariaSelected: 2,
    			ariaControls: 3,
    			tabIndex: 4,
    			css: 17,
    			type: 5
    		});
    	}
    }

    var Button$1 = Button;

    /* src/stories/ButtonGroup.svelte generated by Svelte v3.39.0 */

    function add_css$f() {
    	var style = element("style");
    	style.id = "svelte-h5qofu-style";
    	style.textContent = ".btn-group.svelte-h5qofu{display:inline-flex;flex-direction:row}.btn-group.svelte-h5qofu>button {border-radius:var(--agnostic-btn-radius, var(--agnostic-radius, 0.25rem))}.btn-group.svelte-h5qofu>button:not(:last-child) {border-top-right-radius:0;border-bottom-right-radius:0;margin-inline-end:-1px}.btn-group.svelte-h5qofu>button:not(:first-child) {border-top-left-radius:0;border-bottom-left-radius:0}";
    	append(document.head, style);
    }

    function create_fragment$f(ctx) {
    	let div;
    	let div_class_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", div_class_value = "" + (null_to_empty(/*klasses*/ ctx[1]) + " svelte-h5qofu"));
    			attr(div, "role", "group");
    			attr(div, "aria-label", /*ariaLabel*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen(div, "click", /*click_handler*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[3], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*klasses*/ 2 && div_class_value !== (div_class_value = "" + (null_to_empty(/*klasses*/ ctx[1]) + " svelte-h5qofu"))) {
    				attr(div, "class", div_class_value);
    			}

    			if (!current || dirty & /*ariaLabel*/ 1) {
    				attr(div, "aria-label", /*ariaLabel*/ ctx[0]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { ariaLabel = "" } = $$props;
    	let { css = "" } = $$props;
    	let klasses = ["btn-group", css ? `${css}` : ""];
    	klasses = klasses.filter(klass => klass.length);
    	klasses = klasses.join(" ");

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ('ariaLabel' in $$props) $$invalidate(0, ariaLabel = $$props.ariaLabel);
    		if ('css' in $$props) $$invalidate(2, css = $$props.css);
    		if ('$$scope' in $$props) $$invalidate(3, $$scope = $$props.$$scope);
    	};

    	return [ariaLabel, klasses, css, $$scope, slots, click_handler];
    }

    class ButtonGroup extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-h5qofu-style")) add_css$f();
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, { ariaLabel: 0, css: 2 });
    	}
    }

    var ButtonGroup$1 = ButtonGroup;

    /* src/stories/Card.svelte generated by Svelte v3.39.0 */

    function add_css$e() {
    	var style = element("style");
    	style.id = "svelte-10mqis-style";
    	style.textContent = ".card.svelte-10mqis,.card-base.svelte-10mqis{display:flex;flex-wrap:wrap;align-items:center;position:relative;box-sizing:border-box;width:100%}.card.svelte-10mqis,.card-skin.svelte-10mqis{box-shadow:var(--agnostic-card-boxshadow1-offset-x, 0)\n    var(--agnostic-card-boxshadow1-offset-y, 0.375rem)\n    var(--agnostic-card-boxshadow1-blur, 0.5625rem)\n    var(--agnostic-card-boxshadow1-color, rgb(6 6 6 / 7.5%)),\n    var(--agnostic-card-boxshadow2-offset-x, 0) var(--agnostic-card-boxshadow2-offset-y, 0)\n    var(--agnostic-card-boxshadow2-blur, 1px)\n    var(--agnostic-card-boxshadow2-color, rgb(5 5 5 / 10%));border-radius:var(--agnostic-card-border-radius, var(--agnostic-radius, 0.25rem));overflow:hidden}.card.svelte-10mqis:hover,.card-skin.svelte-10mqis:hover{box-shadow:var(--agnostic-card-boxshadow1-offset-x, 0)\n    var(--agnostic-card-boxshadow1-offset-y, 0.375rem)\n    var(--agnostic-card-boxshadow1-blur, 0.875rem)\n    var(--agnostic-card-boxshadow1-color, rgb(4 4 4 / 10%)),\n    var(--agnostic-card-boxshadow2-offset-x, 0) var(--agnostic-card-boxshadow2-offset-y, 0)\n    var(--agnostic-card-boxshadow2-blur, 2px)\n    var(--agnostic-card-boxshadow2-color, rgb(3 3 3 / 10%))}.card-animated.svelte-10mqis{transition:box-shadow ease-out 5s,\n    transform var(--agnostic-timing-fast)\n    cubic-bezier(\n      var(--agnostic-card-cubic-1, 0.39),\n      var(--agnostic-card-cubic-2, 0.575),\n      var(--agnostic-card-cubic-3, 0.565),\n      var(--agnostic-card-cubic-4, 1)\n    )}.card-animated.svelte-10mqis:hover{transform:translateY(var(--agnostic-card-translateY-hover, -3px));transition:box-shadow ease-out var(--agnostic-timing-fast),\n    transform var(--agnostic-timing-slow)\n    cubic-bezier(\n      var(--agnostic-card-cubic-1, 0.39),\n      var(--agnostic-card-cubic-2, 0.575),\n      var(--agnostic-card-cubic-3, 0.565),\n      var(--agnostic-card-cubic-4, 1)\n    )}@media(prefers-reduced-motion){.card-animated.svelte-10mqis,.card-animated.svelte-10mqis:hover{transition-duration:0.001ms !important}}.card-stacked.svelte-10mqis{flex-direction:column}";
    	append(document.head, style);
    }

    function create_fragment$e(ctx) {
    	let div;
    	let div_class_value;
    	let current;
    	let mounted;
    	let dispose;
    	const default_slot_template = /*#slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", div_class_value = "" + (null_to_empty(/*klasses*/ ctx[0]) + " svelte-10mqis"));
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(div, "click", /*click_handler*/ ctx[7]),
    					listen(div, "focus", /*focus_handler*/ ctx[8]),
    					listen(div, "blur", /*blur_handler*/ ctx[9])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 32)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[5], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*klasses*/ 1 && div_class_value !== (div_class_value = "" + (null_to_empty(/*klasses*/ ctx[0]) + " svelte-10mqis"))) {
    				attr(div, "class", div_class_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$e($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { isAnimated = false } = $$props;
    	let { isSkinned = true } = $$props;
    	let { isStacked = false } = $$props;
    	let { css = "" } = $$props;

    	let klasses = [
    		isSkinned ? "card" : "card-base",
    		isAnimated ? "card-animated" : "",
    		isStacked ? "card-stacked" : "",
    		css ? `${css}` : ""
    	];

    	klasses = klasses.filter(klass => klass.length);
    	klasses = klasses.join(" ");

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function blur_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ('isAnimated' in $$props) $$invalidate(1, isAnimated = $$props.isAnimated);
    		if ('isSkinned' in $$props) $$invalidate(2, isSkinned = $$props.isSkinned);
    		if ('isStacked' in $$props) $$invalidate(3, isStacked = $$props.isStacked);
    		if ('css' in $$props) $$invalidate(4, css = $$props.css);
    		if ('$$scope' in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	return [
    		klasses,
    		isAnimated,
    		isSkinned,
    		isStacked,
    		css,
    		$$scope,
    		slots,
    		click_handler,
    		focus_handler,
    		blur_handler
    	];
    }

    class Card extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-10mqis-style")) add_css$e();

    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {
    			isAnimated: 1,
    			isSkinned: 2,
    			isStacked: 3,
    			css: 4
    		});
    	}
    }

    var Card$1 = Card;

    /* src/stories/ChoiceInput.svelte generated by Svelte v3.39.0 */

    function add_css$d() {
    	var style = element("style");
    	style.id = "svelte-1tl5mgr-style";
    	style.textContent = ".checkbox-group.svelte-1tl5mgr.svelte-1tl5mgr,.radio-group.svelte-1tl5mgr.svelte-1tl5mgr{--width-28:calc(7 * var(--fluid-4));border:1px solid var(--agnostic-checkbox-border-color, var(--agnostic-gray-light));padding:var(--fluid-24);padding-top:var(--fluid-14);border-radius:var(--fluid-8)}.checkbox-group-large.svelte-1tl5mgr.svelte-1tl5mgr,.radio-group-large.svelte-1tl5mgr.svelte-1tl5mgr{padding:var(--width-28);padding-top:var(--fluid-16)}.checkbox-legend.svelte-1tl5mgr.svelte-1tl5mgr,.radio-legend.svelte-1tl5mgr.svelte-1tl5mgr{padding:var(--fluid-2) var(--fluid-14);border-radius:var(--fluid-2)}.checkbox.svelte-1tl5mgr.svelte-1tl5mgr,.radio.svelte-1tl5mgr.svelte-1tl5mgr{position:absolute;width:var(--fluid-14);height:var(--fluid-14);opacity:0%}.checkbox-small.svelte-1tl5mgr.svelte-1tl5mgr,.radio-small.svelte-1tl5mgr.svelte-1tl5mgr{width:var(--fluid-12);height:var(--fluid-12)}.checkbox-large.svelte-1tl5mgr.svelte-1tl5mgr,.radio-large.svelte-1tl5mgr.svelte-1tl5mgr{width:var(--fluid-16);height:var(--fluid-16)}.checkbox-label-wrap.svelte-1tl5mgr.svelte-1tl5mgr,.radio-label-wrap.svelte-1tl5mgr.svelte-1tl5mgr{display:block;cursor:pointer;user-select:none;position:relative;line-height:var(--fluid-36)}.checkbox-label-wrap-inline.svelte-1tl5mgr.svelte-1tl5mgr,.radio-label-wrap-inline.svelte-1tl5mgr.svelte-1tl5mgr{display:inline-flex}.checkbox-label-wrap-inline.svelte-1tl5mgr.svelte-1tl5mgr:not(:last-child),.radio-label-wrap-inline.svelte-1tl5mgr.svelte-1tl5mgr:not(:last-child){margin-inline-end:var(--fluid-8)}.checkbox-label.svelte-1tl5mgr.svelte-1tl5mgr,.radio-label.svelte-1tl5mgr.svelte-1tl5mgr{display:flex;align-items:center;flex-wrap:wrap}.checkbox-label.svelte-1tl5mgr.svelte-1tl5mgr::after{content:\"\";position:absolute;left:var(--fluid-6);top:var(--fluid-10);width:var(--fluid-6);height:var(--fluid-12);border:solid white;border-width:0 var(--fluid-2) var(--fluid-2) 0;transform-origin:center center;transform:rotate(40deg) scale(0);transition-property:border, background-color, transform;transition-duration:var(--agnostic-timing-fast);transition-timing-function:ease-in-out}.checkbox-label.svelte-1tl5mgr.svelte-1tl5mgr::before,.radio-label.svelte-1tl5mgr.svelte-1tl5mgr::before{content:\"\";display:inline-block;margin-inline-end:var(--agnostic-checkbox-spacing-end, 0.75rem);transition:var(--agnostic-timing-fast) ease-out all}.checkbox-label.svelte-1tl5mgr.svelte-1tl5mgr::before{border:2px solid var(--agnostic-checkbox-border-color, var(--agnostic-gray-light));width:var(--fluid-16);height:var(--fluid-16);transition:box-shadow var(--agnostic-timing-fast) ease-out}.radio-label.svelte-1tl5mgr.svelte-1tl5mgr::before{width:var(--fluid-14);height:var(--fluid-14);vertical-align:calc(-1 * var(--fluid-2));border-radius:50%;border:var(--fluid-2) solid var(--agnostic-checkbox-light, var(--agnostic-light));box-shadow:0 0 0 var(--fluid-2) var(--agnostic-checkbox-border-color, var(--agnostic-gray-light));transition:box-shadow var(--agnostic-timing-fast) ease-out}@media(prefers-reduced-motion){.checkbox-label.svelte-1tl5mgr.svelte-1tl5mgr::after,.checkbox-label.svelte-1tl5mgr.svelte-1tl5mgr::before,.radio-label.svelte-1tl5mgr.svelte-1tl5mgr::before{transition-duration:0.001ms !important}}.checkbox-label-small.svelte-1tl5mgr.svelte-1tl5mgr::after{left:calc(1.25 * var(--fluid-4))}.checkbox-label-small.svelte-1tl5mgr.svelte-1tl5mgr::before{width:var(--fluid-14);height:var(--fluid-14)}.radio-label-small.svelte-1tl5mgr.svelte-1tl5mgr::before{width:var(--fluid-12);height:var(--fluid-12)}.checkbox-label-large.svelte-1tl5mgr.svelte-1tl5mgr::after{left:calc(1.75 * var(--fluid-4))}.checkbox-label-large.svelte-1tl5mgr.svelte-1tl5mgr::before{width:var(--fluid-18);height:var(--fluid-18)}.radio-label-large.svelte-1tl5mgr.svelte-1tl5mgr::before{width:var(--fluid-16);height:var(--fluid-16)}.radio.svelte-1tl5mgr:checked+.radio-label.svelte-1tl5mgr::before{background:var(--agnostic-checkbox-fill-color, #08a880);box-shadow:0 0 0 var(--fluid-2) var(--agnostic-checkbox-border-color, var(--agnostic-gray-light))}.radio.svelte-1tl5mgr:focus+.radio-label.svelte-1tl5mgr::before{box-shadow:0 0 0 var(--fluid-2) var(--agnostic-checkbox-border-color, var(--agnostic-gray-light)),\n    0 0 0 calc(1.5 * var(--fluid-2)) white,\n    0 0 0 calc(2.25 * var(--fluid-2)) var(--agnostic-focus-ring-color)}.checkbox.svelte-1tl5mgr:focus+.checkbox-label.svelte-1tl5mgr::before{box-shadow:0 0 0 var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-color);outline:var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-outline-style)\n    var(--agnostic-focus-ring-outline-color)}.checkbox.svelte-1tl5mgr:checked+.checkbox-label.svelte-1tl5mgr::after{transform:rotate(40deg) scale(1)}.checkbox.svelte-1tl5mgr:checked+.checkbox-label.svelte-1tl5mgr::before{background:var(--agnostic-checkbox-fill-color, #08a880);border:2px solid var(--agnostic-checkbox-fill-color, #08a880)}.checkbox-group-hidden.svelte-1tl5mgr.svelte-1tl5mgr,.radio-group-hidden.svelte-1tl5mgr.svelte-1tl5mgr{border:0;margin-block-start:0;margin-inline-start:0;margin-inline-end:0;margin-block-end:0;padding-block-start:0;padding-inline-start:0;padding-inline-end:0;padding-block-end:0}.checkbox[disabled].svelte-1tl5mgr+.checkbox-label.svelte-1tl5mgr,.radio[disabled].svelte-1tl5mgr+.radio-label.svelte-1tl5mgr,.checkbox-label-wrap.disabled.svelte-1tl5mgr.svelte-1tl5mgr,.radio-label-wrap.disabled.svelte-1tl5mgr.svelte-1tl5mgr,.checkbox-label-wrap-inline.disabled.svelte-1tl5mgr.svelte-1tl5mgr,.radio-label-wrap-inline.disabled.svelte-1tl5mgr.svelte-1tl5mgr{color:var(--agnostic-input-disabled-color, var(--agnostic-disabled-color)) !important;appearance:none !important;box-shadow:none !important;cursor:not-allowed !important;opacity:80% !important}@media screen and (-ms-high-contrast: active){.checkbox-label-wrap.disabled.svelte-1tl5mgr.svelte-1tl5mgr,.radio-label-wrap.disabled.svelte-1tl5mgr.svelte-1tl5mgr,.checkbox-label-wrap-inline.disabled.svelte-1tl5mgr.svelte-1tl5mgr,.radio-label-wrap-inline.disabled.svelte-1tl5mgr.svelte-1tl5mgr{outline:2px solid transparent;outline-offset:-2px}}";
    	append(document.head, style);
    }

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[23] = list[i].name;
    	child_ctx[24] = list[i].value;
    	child_ctx[25] = list[i].label;
    	child_ctx[27] = i;
    	return child_ctx;
    }

    // (317:2) {#each options as { name, value, label }
    function create_each_block$2(ctx) {
    	let label;
    	let input;
    	let input_class_value;
    	let input_id_value;
    	let input_type_value;
    	let input_name_value;
    	let input_value_value;
    	let input_disabled_value;
    	let input_checked_value;
    	let t0;
    	let span;
    	let t1_value = /*label*/ ctx[25] + "";
    	let t1;
    	let span_class_value;
    	let t2;
    	let label_class_value;
    	let label_disabled_value;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		{
    			class: input_class_value = /*inputClasses*/ ctx[10]()
    		},
    		{
    			id: input_id_value = "choice-" + /*name*/ ctx[23] + "-" + /*index*/ ctx[27]
    		},
    		{
    			type: input_type_value = /*getType*/ ctx[5]()
    		},
    		{
    			name: input_name_value = /*name*/ ctx[23]
    		},
    		{
    			value: input_value_value = /*value*/ ctx[24]
    		},
    		{
    			disabled: input_disabled_value = /*isDisabled*/ ctx[0] || /*disabledOptions*/ ctx[2].includes(/*value*/ ctx[24])
    		},
    		{
    			checked: input_checked_value = /*checkedOptions*/ ctx[3].includes(/*value*/ ctx[24])
    		},
    		/*$$restProps*/ ctx[11]
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			label = element("label");
    			input = element("input");
    			t0 = space();
    			span = element("span");
    			t1 = text(t1_value);
    			t2 = space();
    			set_attributes(input, input_data);
    			toggle_class(input, "svelte-1tl5mgr", true);
    			attr(span, "class", span_class_value = "" + (null_to_empty(/*labelSpanClasses*/ ctx[7]()) + " svelte-1tl5mgr"));
    			attr(label, "class", label_class_value = "" + (null_to_empty(/*labelClasses*/ ctx[6]()) + " svelte-1tl5mgr"));
    			attr(label, "disabled", label_disabled_value = /*isDisabled*/ ctx[0] || /*disabledOptions*/ ctx[2].includes(/*value*/ ctx[24]) || undefined);
    		},
    		m(target, anchor) {
    			insert(target, label, anchor);
    			append(label, input);
    			input.value = input_data.value;
    			append(label, t0);
    			append(label, span);
    			append(span, t1);
    			append(label, t2);

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler*/ ctx[17]),
    					listen(input, "change", /*change_handler*/ ctx[18]),
    					listen(input, "input", /*input_handler*/ ctx[19]),
    					listen(input, "click", /*click_handler*/ ctx[20]),
    					listen(input, "focus", /*focus_handler*/ ctx[21])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				{ class: input_class_value },
    				dirty & /*options*/ 2 && input_id_value !== (input_id_value = "choice-" + /*name*/ ctx[23] + "-" + /*index*/ ctx[27]) && { id: input_id_value },
    				{ type: input_type_value },
    				dirty & /*options*/ 2 && input_name_value !== (input_name_value = /*name*/ ctx[23]) && { name: input_name_value },
    				dirty & /*options*/ 2 && input_value_value !== (input_value_value = /*value*/ ctx[24]) && input.value !== input_value_value && { value: input_value_value },
    				dirty & /*isDisabled, disabledOptions, options*/ 7 && input_disabled_value !== (input_disabled_value = /*isDisabled*/ ctx[0] || /*disabledOptions*/ ctx[2].includes(/*value*/ ctx[24])) && { disabled: input_disabled_value },
    				dirty & /*checkedOptions, options*/ 10 && input_checked_value !== (input_checked_value = /*checkedOptions*/ ctx[3].includes(/*value*/ ctx[24])) && { checked: input_checked_value },
    				dirty & /*$$restProps*/ 2048 && /*$$restProps*/ ctx[11]
    			]));

    			if ('value' in input_data) {
    				input.value = input_data.value;
    			}

    			toggle_class(input, "svelte-1tl5mgr", true);
    			if (dirty & /*options*/ 2 && t1_value !== (t1_value = /*label*/ ctx[25] + "")) set_data(t1, t1_value);

    			if (dirty & /*isDisabled, disabledOptions, options*/ 7 && label_disabled_value !== (label_disabled_value = /*isDisabled*/ ctx[0] || /*disabledOptions*/ ctx[2].includes(/*value*/ ctx[24]) || undefined)) {
    				attr(label, "disabled", label_disabled_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(label);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment$d(ctx) {
    	let fieldset;
    	let legend;
    	let t0;
    	let t1;
    	let each_value = /*options*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	return {
    		c() {
    			fieldset = element("fieldset");
    			legend = element("legend");
    			t0 = text(/*legendLabel*/ ctx[4]);
    			t1 = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(legend, "class", "" + (null_to_empty(/*legendClasses*/ ctx[8]()) + " svelte-1tl5mgr"));
    			attr(fieldset, "class", "" + (null_to_empty(/*fieldsetClasses*/ ctx[9]()) + " svelte-1tl5mgr"));
    		},
    		m(target, anchor) {
    			insert(target, fieldset, anchor);
    			append(fieldset, legend);
    			append(legend, t0);
    			append(fieldset, t1);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(fieldset, null);
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*legendLabel*/ 16) set_data(t0, /*legendLabel*/ ctx[4]);

    			if (dirty & /*labelClasses, isDisabled, disabledOptions, options, undefined, labelSpanClasses, inputClasses, getType, checkedOptions, $$restProps*/ 3311) {
    				each_value = /*options*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(fieldset, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(fieldset);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$d($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"isSkinned","isFieldset","isInline","isDisabled","options","disabledOptions","checkedOptions","legendLabel","type","size"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	const TYPE = ["checkbox", "radio"];
    	let { isSkinned = true } = $$props;
    	let { isFieldset = true } = $$props;
    	let { isInline = false } = $$props;
    	let { isDisabled = undefined } = $$props;
    	let { options = [] } = $$props;
    	let { disabledOptions = [] } = $$props;
    	let { checkedOptions = [] } = $$props;
    	let { legendLabel = "" } = $$props;
    	let { type = "checkbox" } = $$props;
    	let { size = "" } = $$props;

    	const getType = () => {
    		if (!TYPE.includes(type)) {
    			console.warn(`allowed types are ${TYPE}`);
    			$$invalidate(12, type = "checkbox");
    		}

    		return type;
    	};

    	const labelClasses = () => {
    		let klasses = [
    			type ? `${type}-label-wrap` : "",
    			isInline ? `${type}-label-wrap-inline` : ""
    		];

    		klasses = klasses.filter(klass => klass.length);
    		return klasses.join(" ");
    	};

    	const labelSpanClasses = () => {
    		let klasses = [type ? `${type}-label` : "", size ? `${type}-label-${size}` : ""];
    		klasses = klasses.filter(klass => klass.length);
    		return klasses.join(" ");
    	};

    	const legendClasses = () => {
    		// If consumer sets is skinned to false we don't style the legend
    		let skin = isSkinned ? `${type}-legend` : "";

    		let klasses = [
    			skin,
    			// .screenreader-only is expected to be globally available via common.min.css
    			isFieldset === false ? "screenreader-only" : ""
    		];

    		return klasses.join(" ");
    	};

    	const fieldsetClasses = () => {
    		// If consumer sets is skinned to false we don't style the fieldset
    		const skin = isSkinned ? `${type}-group` : "";

    		// we only add the fieldset class for large (not small) e.g. radio|checkbox-group-large
    		const sizeSkin = isSkinned && size === "large"
    		? `${type}-group-${size}`
    		: "";

    		let klasses = [skin, sizeSkin, isFieldset === false ? `${type}-group-hidden` : ""];
    		klasses = klasses.filter(klass => klass.length);
    		return klasses.join(" ");
    	};

    	const inputClasses = () => {
    		let inputKlasses = [
    			type ? `${type}` : "",
    			size ? `${type}-${size}` : "",
    			isDisabled ? "disabled" : ""
    		];

    		inputKlasses = inputKlasses.filter(klass => klass.length);
    		return inputKlasses.join(" ");
    	};

    	function blur_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function change_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function input_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(11, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ('isSkinned' in $$new_props) $$invalidate(13, isSkinned = $$new_props.isSkinned);
    		if ('isFieldset' in $$new_props) $$invalidate(14, isFieldset = $$new_props.isFieldset);
    		if ('isInline' in $$new_props) $$invalidate(15, isInline = $$new_props.isInline);
    		if ('isDisabled' in $$new_props) $$invalidate(0, isDisabled = $$new_props.isDisabled);
    		if ('options' in $$new_props) $$invalidate(1, options = $$new_props.options);
    		if ('disabledOptions' in $$new_props) $$invalidate(2, disabledOptions = $$new_props.disabledOptions);
    		if ('checkedOptions' in $$new_props) $$invalidate(3, checkedOptions = $$new_props.checkedOptions);
    		if ('legendLabel' in $$new_props) $$invalidate(4, legendLabel = $$new_props.legendLabel);
    		if ('type' in $$new_props) $$invalidate(12, type = $$new_props.type);
    		if ('size' in $$new_props) $$invalidate(16, size = $$new_props.size);
    	};

    	return [
    		isDisabled,
    		options,
    		disabledOptions,
    		checkedOptions,
    		legendLabel,
    		getType,
    		labelClasses,
    		labelSpanClasses,
    		legendClasses,
    		fieldsetClasses,
    		inputClasses,
    		$$restProps,
    		type,
    		isSkinned,
    		isFieldset,
    		isInline,
    		size,
    		blur_handler,
    		change_handler,
    		input_handler,
    		click_handler,
    		focus_handler
    	];
    }

    class ChoiceInput extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1tl5mgr-style")) add_css$d();

    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {
    			isSkinned: 13,
    			isFieldset: 14,
    			isInline: 15,
    			isDisabled: 0,
    			options: 1,
    			disabledOptions: 2,
    			checkedOptions: 3,
    			legendLabel: 4,
    			type: 12,
    			size: 16
    		});
    	}
    }

    var ChoiceInput$1 = ChoiceInput;

    /* src/stories/Close.svelte generated by Svelte v3.39.0 */

    function add_css$c() {
    	var style = element("style");
    	style.id = "svelte-e9pasz-style";
    	style.textContent = ".close-button.svelte-e9pasz.svelte-e9pasz{background-color:transparent;border:0;border-radius:0;box-shadow:none;width:var(--fluid-24);height:var(--fluid-24)}.close-button.svelte-e9pasz.svelte-e9pasz:hover,.close-button.svelte-e9pasz.svelte-e9pasz:active,.close-button.svelte-e9pasz.svelte-e9pasz:focus{background:none;outline:var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-outline-style)\n    var(--agnostic-focus-ring-outline-color)}.close-button.svelte-e9pasz.svelte-e9pasz:focus{box-shadow:0 0 0 3px var(--agnostic-focus-ring-color);transition:box-shadow var(--agnostic-timing-fast) ease-out}.close.svelte-e9pasz.svelte-e9pasz{width:var(--fluid-12);height:var(--fluid-12);display:inline-block;vertical-align:middle;line-height:1em;flex-shrink:0;color:currentColor}.close-button.svelte-e9pasz .close.svelte-e9pasz{opacity:80%;transition:opacity var(--agnostic-timing-medium)}@media(prefers-reduced-motion){.close-button.svelte-e9pasz.svelte-e9pasz:focus,.close-button.svelte-e9pasz .close.svelte-e9pasz{transition-duration:0.001ms !important}}.close-button-small.svelte-e9pasz.svelte-e9pasz{width:var(--fluid-18);height:var(--fluid-18)}.close-button-large.svelte-e9pasz.svelte-e9pasz{width:var(--fluid-32);height:var(--fluid-32)}.close-button-xlarge.svelte-e9pasz.svelte-e9pasz{width:var(--fluid-40);height:var(--fluid-40)}.close-button-small.svelte-e9pasz>.close.svelte-e9pasz{width:0.5625rem;height:0.5625rem}.close-button-large.svelte-e9pasz>.close.svelte-e9pasz{width:var(--fluid-16);height:var(--fluid-16)}.close-button-xlarge.svelte-e9pasz>.close.svelte-e9pasz{width:var(--fluid-20);height:var(--fluid-20)}.close-button.svelte-e9pasz:hover .close.svelte-e9pasz{opacity:100%}";
    	append(document.head, style);
    }

    function create_fragment$c(ctx) {
    	let button;
    	let svg;
    	let path;

    	return {
    		c() {
    			button = element("button");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr(path, "fill", "currentColor");
    			attr(path, "d", "M.439 21.44a1.5 1.5 0 0 0 2.122 2.121l9.262-9.261a.25.25 0 0 1 .354 0l9.262 9.263a1.5 1.5 0 1 0 2.122-2.121L14.3 12.177a.25.25 0 0 1 0-.354l9.263-9.262A1.5 1.5 0 0 0 21.439.44L12.177 9.7a.25.25 0 0 1-.354 0L2.561.44A1.5 1.5 0 0 0 .439 2.561L9.7 11.823a.25.25 0 0 1 0 .354Z");
    			attr(svg, "class", "close svelte-e9pasz");
    			attr(svg, "viewBox", "0 0 24 24");
    			attr(svg, "aria-hidden", "true");
    			attr(button, "class", "" + (null_to_empty(/*closeButtonClasses*/ ctx[0]) + " svelte-e9pasz"));
    			attr(button, "aria-label", "Close");
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			append(button, svg);
    			append(svg, path);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    		}
    	};
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let { size = "" } = $$props;
    	const closeButtonClasses = ["close-button", size ? `close-button-${size}` : ""].filter(c => c).join(" ");

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(1, size = $$props.size);
    	};

    	return [closeButtonClasses, size];
    }

    class Close extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-e9pasz-style")) add_css$c();
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, { size: 1 });
    	}
    }

    var Close$1 = Close;

    /* src/stories/Disclose.svelte generated by Svelte v3.39.0 */

    function add_css$b() {
    	var style = element("style");
    	style.id = "svelte-1busd3i-style";
    	style.textContent = ".disclose.svelte-1busd3i.svelte-1busd3i{margin-block-end:var(--fluid-4)}.disclose-title.svelte-1busd3i.svelte-1busd3i{display:block;cursor:pointer;font-weight:600;padding:var(--fluid-8) var(--fluid-12);position:relative;color:inherit;transition:color var(--agnostic-timing-slow)}.disclose-panel.svelte-1busd3i.svelte-1busd3i{font-weight:400;padding:var(--fluid-16)}.disclose-title.svelte-1busd3i.svelte-1busd3i,.disclose-panel.svelte-1busd3i.svelte-1busd3i{margin:0}.disclose-title.svelte-1busd3i.svelte-1busd3i::webkit-details-marker{display:none}.disclose-bg.svelte-1busd3i .disclose-title.svelte-1busd3i{background-color:var(--agnostic-gray-light)}.disclose-title.svelte-1busd3i.svelte-1busd3i:focus{box-shadow:0 0 0 var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-color);outline:var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-outline-style)\n    var(--agnostic-focus-ring-outline-color);transition:box-shadow var(--agnostic-timing-fast) ease-out}.disclose-title.svelte-1busd3i.svelte-1busd3i::after{color:var(--agnostic-gray-dark);content:\"\\203A\";position:absolute;right:var(--fluid-12);top:0;bottom:0;font-size:var(--fluid-32);line-height:1;font-weight:100;transition:transform var(--agnostic-timing-slow);transform:rotate(0)}@media(prefers-reduced-motion: reduce){.disclose-title.svelte-1busd3i.svelte-1busd3i,.disclose-title.svelte-1busd3i.svelte-1busd3i:focus,.disclose-title.svelte-1busd3i.svelte-1busd3i::after{transition:none}}.disclose[open].svelte-1busd3i>.disclose-title.svelte-1busd3i::after{transform:rotate(90deg)}";
    	append(document.head, style);
    }

    function create_fragment$b(ctx) {
    	let details;
    	let summary;
    	let t0;
    	let t1;
    	let div;
    	let details_open_value;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	return {
    		c() {
    			details = element("details");
    			summary = element("summary");
    			t0 = text(/*title*/ ctx[0]);
    			t1 = space();
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(summary, "class", "disclose-title svelte-1busd3i");
    			attr(div, "class", "disclose-panel svelte-1busd3i");
    			attr(details, "class", "" + (null_to_empty(/*discloseClasses*/ ctx[2]) + " svelte-1busd3i"));
    			details.open = details_open_value = /*isOpen*/ ctx[1] || null;
    		},
    		m(target, anchor) {
    			insert(target, details, anchor);
    			append(details, summary);
    			append(summary, t0);
    			append(details, t1);
    			append(details, div);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*title*/ 1) set_data(t0, /*title*/ ctx[0]);

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 16)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[4], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*isOpen*/ 2 && details_open_value !== (details_open_value = /*isOpen*/ ctx[1] || null)) {
    				details.open = details_open_value;
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(details);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { title = "" } = $$props;
    	let { isOpen = false } = $$props;
    	let { isBackground = false } = $$props;
    	const discloseClasses = ["disclose", isBackground ? "disclose-bg" : ""].filter(c => c).join(" ");

    	$$self.$$set = $$props => {
    		if ('title' in $$props) $$invalidate(0, title = $$props.title);
    		if ('isOpen' in $$props) $$invalidate(1, isOpen = $$props.isOpen);
    		if ('isBackground' in $$props) $$invalidate(3, isBackground = $$props.isBackground);
    		if ('$$scope' in $$props) $$invalidate(4, $$scope = $$props.$$scope);
    	};

    	return [title, isOpen, discloseClasses, isBackground, $$scope, slots];
    }

    class Disclose extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1busd3i-style")) add_css$b();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { title: 0, isOpen: 1, isBackground: 3 });
    	}
    }

    var Disclose$1 = Disclose;

    /* src/stories/Header.svelte generated by Svelte v3.39.0 */

    function add_css$a() {
    	var style = element("style");
    	style.id = "svelte-s50boo-style";
    	style.textContent = ".header.svelte-s50boo,.header-base.svelte-s50boo{display:block}.header-base.svelte-s50boo img,.header.svelte-s50boo img{max-width:100%;height:auto}.header.svelte-s50boo,.header-skin.svelte-s50boo{background-color:var(--agnostic-header-background-color, var(--agnostic-light));box-shadow:var(--agnostic-header-box-shadow-hor, 0) var(--agnostic-header-box-shadow-ver, 1px)\n    var(--agnostic-header-box-shadow-blur, 5px) var(--agnostic-header-box-shadow-spread, 2px)\n    var(--agnostic-header-box-shadow-color, rgb(0 0 0 / 10%));font-family:var(--agnostic-header-font-family, var(--agnostic-font-family));border-bottom:1px solid var(--agnostic-header-border-color, var(--agnostic-gray-light));padding-block-start:var(--agnostic-vertical-pad, 0.5rem);padding-block-end:var(--agnostic-vertical-pad, 0.5rem);padding-inline-start:var(--fluid-24);padding-inline-end:var(--fluid-24)}.header-content.svelte-s50boo{width:var(--agnostic-header-content-width, 960px);max-width:100%;margin:0 auto;display:flex;justify-content:space-around;align-items:center;flex-flow:wrap column}.header-sticky.svelte-s50boo{position:relative;top:0;z-index:10}@media(min-width: 960px){.header-sticky.svelte-s50boo{position:sticky}.header-content.svelte-s50boo{flex-direction:row;justify-content:space-between}.header-content-start.svelte-s50boo{justify-content:flex-start}.header-content-end.svelte-s50boo{justify-content:flex-end}}";
    	append(document.head, style);
    }

    const get_logoright_slot_changes = dirty => ({});
    const get_logoright_slot_context = ctx => ({});
    const get_logoleft_slot_changes = dirty => ({});
    const get_logoleft_slot_context = ctx => ({});

    function create_fragment$a(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let t1;
    	let current;
    	const logoleft_slot_template = /*#slots*/ ctx[8].logoleft;
    	const logoleft_slot = create_slot(logoleft_slot_template, ctx, /*$$scope*/ ctx[7], get_logoleft_slot_context);
    	const default_slot_template = /*#slots*/ ctx[8].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[7], null);
    	const logoright_slot_template = /*#slots*/ ctx[8].logoright;
    	const logoright_slot = create_slot(logoright_slot_template, ctx, /*$$scope*/ ctx[7], get_logoright_slot_context);

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");
    			if (logoleft_slot) logoleft_slot.c();
    			t0 = space();
    			if (default_slot) default_slot.c();
    			t1 = space();
    			if (logoright_slot) logoright_slot.c();
    			attr(div0, "class", "" + (null_to_empty(/*headerContentClasses*/ ctx[1]) + " svelte-s50boo"));
    			attr(div1, "class", "" + (null_to_empty(/*klasses*/ ctx[0]) + " svelte-s50boo"));
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);

    			if (logoleft_slot) {
    				logoleft_slot.m(div0, null);
    			}

    			append(div0, t0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			append(div0, t1);

    			if (logoright_slot) {
    				logoright_slot.m(div0, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (logoleft_slot) {
    				if (logoleft_slot.p && (!current || dirty & /*$$scope*/ 128)) {
    					update_slot(logoleft_slot, logoleft_slot_template, ctx, /*$$scope*/ ctx[7], !current ? -1 : dirty, get_logoleft_slot_changes, get_logoleft_slot_context);
    				}
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 128)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[7], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (logoright_slot) {
    				if (logoright_slot.p && (!current || dirty & /*$$scope*/ 128)) {
    					update_slot(logoright_slot, logoright_slot_template, ctx, /*$$scope*/ ctx[7], !current ? -1 : dirty, get_logoright_slot_changes, get_logoright_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(logoleft_slot, local);
    			transition_in(default_slot, local);
    			transition_in(logoright_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(logoleft_slot, local);
    			transition_out(default_slot, local);
    			transition_out(logoright_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			if (logoleft_slot) logoleft_slot.d(detaching);
    			if (default_slot) default_slot.d(detaching);
    			if (logoright_slot) logoright_slot.d(detaching);
    		}
    	};
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { isSticky = false } = $$props;
    	let { isSkinned = true } = $$props;
    	let { isHeaderContentStart = false } = $$props;
    	let { isHeaderContentEnd = false } = $$props;
    	let { css = "" } = $$props;

    	const klasses = [
    		isSkinned ? "header" : "header-base",
    		isSticky ? "header-sticky" : "",
    		css ? `${css}` : ""
    	].filter(cl => cl.length).join(" ");

    	const headerContentClasses = [
    		"header-content",
    		isHeaderContentStart ? "header-content-start" : "",
    		isHeaderContentEnd ? "header-content-end" : ""
    	].filter(cl => cl.length).join(" ");

    	$$self.$$set = $$props => {
    		if ('isSticky' in $$props) $$invalidate(2, isSticky = $$props.isSticky);
    		if ('isSkinned' in $$props) $$invalidate(3, isSkinned = $$props.isSkinned);
    		if ('isHeaderContentStart' in $$props) $$invalidate(4, isHeaderContentStart = $$props.isHeaderContentStart);
    		if ('isHeaderContentEnd' in $$props) $$invalidate(5, isHeaderContentEnd = $$props.isHeaderContentEnd);
    		if ('css' in $$props) $$invalidate(6, css = $$props.css);
    		if ('$$scope' in $$props) $$invalidate(7, $$scope = $$props.$$scope);
    	};

    	return [
    		klasses,
    		headerContentClasses,
    		isSticky,
    		isSkinned,
    		isHeaderContentStart,
    		isHeaderContentEnd,
    		css,
    		$$scope,
    		slots
    	];
    }

    class Header extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-s50boo-style")) add_css$a();

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
    			isSticky: 2,
    			isSkinned: 3,
    			isHeaderContentStart: 4,
    			isHeaderContentEnd: 5,
    			css: 6
    		});
    	}
    }

    var Header$1 = Header;

    /* src/stories/HeaderNav.svelte generated by Svelte v3.39.0 */

    function add_css$9() {
    	var style = element("style");
    	style.id = "svelte-xmqeos-style";
    	style.textContent = ".header-nav.svelte-xmqeos{margin:0;padding:0;display:flex;flex-direction:column;align-items:center}@media(min-width: 960px){.header-nav.svelte-xmqeos{flex-direction:row}}";
    	append(document.head, style);
    }

    function create_fragment$9(ctx) {
    	let nav;
    	let ul;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[3].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

    	return {
    		c() {
    			nav = element("nav");
    			ul = element("ul");
    			if (default_slot) default_slot.c();
    			attr(ul, "class", "header-nav svelte-xmqeos");
    			attr(nav, "class", "" + (null_to_empty(/*containerClasses*/ ctx[0]) + " svelte-xmqeos"));
    		},
    		m(target, anchor) {
    			insert(target, nav, anchor);
    			append(nav, ul);

    			if (default_slot) {
    				default_slot.m(ul, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[2], !current ? -1 : dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(nav);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { css = "" } = $$props;
    	const containerClasses = [css ? `${css}` : ""].filter(c => c.length);

    	$$self.$$set = $$props => {
    		if ('css' in $$props) $$invalidate(1, css = $$props.css);
    		if ('$$scope' in $$props) $$invalidate(2, $$scope = $$props.$$scope);
    	};

    	return [containerClasses, css, $$scope, slots];
    }

    class HeaderNav extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-xmqeos-style")) add_css$9();
    		init(this, options, instance$9, create_fragment$9, safe_not_equal, { css: 1 });
    	}
    }

    var HeaderNav$1 = HeaderNav;

    /* src/stories/HeaderNavItem.svelte generated by Svelte v3.39.0 */

    function add_css$8() {
    	var style = element("style");
    	style.id = "svelte-ogomo2-style";
    	style.textContent = ".header-nav-item.svelte-ogomo2{display:inline-block}.header-nav-item.svelte-ogomo2:not(:last-child){margin-inline-end:initial;margin-block-end:var(--fluid-8)}.header-nav-item.svelte-ogomo2 a{color:var(--agnostic-header-color, var(--agnostic-font-color))}@media(min-width: 960px){.header-nav-item.svelte-ogomo2:not(:last-child){margin-inline-end:var(--agnostic-header-nav-spacing, var(--fluid-32));margin-block-end:initial}}";
    	append(document.head, style);
    }

    function create_fragment$8(ctx) {
    	let li;
    	let li_class_value;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[3].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

    	return {
    		c() {
    			li = element("li");
    			if (default_slot) default_slot.c();
    			attr(li, "class", li_class_value = "" + (null_to_empty(/*klasses*/ ctx[0]) + " svelte-ogomo2"));
    		},
    		m(target, anchor) {
    			insert(target, li, anchor);

    			if (default_slot) {
    				default_slot.m(li, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[2], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*klasses*/ 1 && li_class_value !== (li_class_value = "" + (null_to_empty(/*klasses*/ ctx[0]) + " svelte-ogomo2"))) {
    				attr(li, "class", li_class_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(li);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { css = "" } = $$props;
    	let klasses = ["header-nav-item", css ? `${css}` : ""];
    	klasses = klasses.filter(klass => klass.length);
    	klasses = klasses.join(" ");

    	$$self.$$set = $$props => {
    		if ('css' in $$props) $$invalidate(1, css = $$props.css);
    		if ('$$scope' in $$props) $$invalidate(2, $$scope = $$props.$$scope);
    	};

    	return [klasses, css, $$scope, slots];
    }

    class HeaderNavItem extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-ogomo2-style")) add_css$8();
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { css: 1 });
    	}
    }

    var HeaderNavItem$1 = HeaderNavItem;

    /* src/stories/Icon.svelte generated by Svelte v3.39.0 */

    function add_css$7() {
    	var style = element("style");
    	style.id = "svelte-1y4yzzq-style";
    	style.textContent = ".icon-base.svelte-1y4yzzq>svg,.icon.svelte-1y4yzzq>svg{display:inline-flex;text-align:center;max-width:100%;pointer-events:none;user-select:none}.icon-skin.svelte-1y4yzzq,.icon.svelte-1y4yzzq,.icon.svelte-1y4yzzq>svg{width:var(--fluid-16);height:var(--fluid-16)}.icon.svelte-1y4yzzq>svg{fill:currentColor}.icon-14.svelte-1y4yzzq,.icon-14.svelte-1y4yzzq>svg{width:var(--fluid-14);height:var(--fluid-14)}.icon-16.svelte-1y4yzzq,.icon-16.svelte-1y4yzzq>svg{width:var(--fluid-16);height:var(--fluid-16)}.icon-18.svelte-1y4yzzq,.icon-18.svelte-1y4yzzq>svg{width:var(--fluid-18);height:var(--fluid-18)}.icon-20.svelte-1y4yzzq,.icon-20.svelte-1y4yzzq>svg{width:var(--fluid-20);height:var(--fluid-20)}.icon-24.svelte-1y4yzzq,.icon-24.svelte-1y4yzzq>svg{width:var(--fluid-24);height:var(--fluid-24)}.icon-32.svelte-1y4yzzq,.icon-32.svelte-1y4yzzq>svg{width:var(--fluid-32);height:var(--fluid-32)}.icon-36.svelte-1y4yzzq,.icon-36.svelte-1y4yzzq>svg{width:var(--fluid-36);height:var(--fluid-36)}.icon-40.svelte-1y4yzzq,.icon-40.svelte-1y4yzzq>svg{width:var(--fluid-40);height:var(--fluid-40)}.icon-48.svelte-1y4yzzq,.icon-48.svelte-1y4yzzq>svg{width:var(--fluid-48);height:var(--fluid-48)}.icon-56.svelte-1y4yzzq,.icon-56.svelte-1y4yzzq>svg{width:var(--fluid-56);height:var(--fluid-56)}.icon-64.svelte-1y4yzzq,.icon-64.svelte-1y4yzzq>svg{width:var(--fluid-64);height:var(--fluid-64)}.icon-info.svelte-1y4yzzq>svg{color:var(--agnostic-primary)}.icon-success.svelte-1y4yzzq>svg{color:var(--agnostic-action)}.icon-warning.svelte-1y4yzzq>svg{color:var(--agnostic-warning-border-accent)}.icon-error.svelte-1y4yzzq>svg{color:var(--agnostic-error)}";
    	append(document.head, style);
    }

    function create_fragment$7(ctx) {
    	let span;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	return {
    		c() {
    			span = element("span");
    			if (default_slot) default_slot.c();
    			attr(span, "class", "" + (null_to_empty(/*iconClasses*/ ctx[0]) + " svelte-1y4yzzq"));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 16)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[4], !current ? -1 : dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { type = [] } = $$props;
    	let { size = [] } = $$props;
    	let { isSkinned = true } = $$props;

    	const iconClasses = [
    		isSkinned ? "icon" : "icon-base",
    		type ? `icon-${type}` : "",
    		size ? `icon-${size}` : ""
    	].filter(cls => cls).join(" ");

    	$$self.$$set = $$props => {
    		if ('type' in $$props) $$invalidate(1, type = $$props.type);
    		if ('size' in $$props) $$invalidate(2, size = $$props.size);
    		if ('isSkinned' in $$props) $$invalidate(3, isSkinned = $$props.isSkinned);
    		if ('$$scope' in $$props) $$invalidate(4, $$scope = $$props.$$scope);
    	};

    	return [iconClasses, type, size, isSkinned, $$scope, slots];
    }

    class Icon extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1y4yzzq-style")) add_css$7();
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { type: 1, size: 2, isSkinned: 3 });
    	}
    }

    var Icon$1 = Icon;

    /* src/stories/Input.svelte generated by Svelte v3.39.0 */

    function add_css$6() {
    	var style = element("style");
    	style.id = "svelte-bbsv3q-style";
    	style.textContent = ".input-base.svelte-bbsv3q,.input.svelte-bbsv3q{user-select:initial;appearance:none;box-sizing:border-box;caret-color:currentColor}.label.svelte-bbsv3q,.label-base.svelte-bbsv3q{padding:0;border:0;box-sizing:border-box;font-family:inherit}.field-help.svelte-bbsv3q,.field-help-large.svelte-bbsv3q,.field-help-small.svelte-bbsv3q,.field-error.svelte-bbsv3q,.field-error-large.svelte-bbsv3q,.field-error-small.svelte-bbsv3q,.label-skin.svelte-bbsv3q,.label.svelte-bbsv3q,.input-addon-container.svelte-bbsv3q,.input-small.svelte-bbsv3q,.input-large.svelte-bbsv3q,.input-skin.svelte-bbsv3q,.input-underlined.svelte-bbsv3q,.input-underlined-bg.svelte-bbsv3q,.input.svelte-bbsv3q{color:var(--agnostic-font-color, var(--agnostic-dark));font-family:var(--agnostic-font-family);font-weight:var(--agnostic-font-weight, 300);font-size:var(--agnostic-font-size, 1rem);line-height:var(--agnostic-line-height, var(--fluid-20, 1.25rem));width:100%;max-width:100%}.input-skin.svelte-bbsv3q,.input.svelte-bbsv3q{border-style:solid;border-width:var(--agnostic-input-border-size, 1px);border-color:var(--agnostic-input-border-color, var(--agnostic-gray-light));padding-block-start:var(--agnostic-input-vertical-pad, 0.5rem);padding-block-end:var(--agnostic-input-vertical-pad, 0.5rem);padding-inline-start:var(--agnostic-input-side-padding, 0.75rem);padding-inline-end:var(--agnostic-input-side-padding, 0.75rem);transition-property:box-shadow;transition-duration:var(--agnostic-input-timing, var(--agnostic-timing-medium))}.label.svelte-bbsv3q{display:inline-block;margin-block-start:0;margin-inline-start:0;margin-inline-end:0;margin-block-end:var(--agnostic-input-label-pad, 0.375rem);vertical-align:initial}.field-help.svelte-bbsv3q,.field-error.svelte-bbsv3q,.label.svelte-bbsv3q,.label-skin.svelte-bbsv3q{font-size:calc(var(--agnostic-font-size, 1rem) - 2px)}.label-inline.svelte-bbsv3q,.input-inline.svelte-bbsv3q{width:auto}.label-inline.svelte-bbsv3q{margin-block-start:0;margin-block-end:0;margin-inline-start:0;margin-inline-end:var(--agnostic-input-side-padding, 0.75rem)}.input.svelte-bbsv3q::-webkit-input-placeholder{color:currentColor;opacity:50%;transition:opacity var(--agnostic-timing-fast) ease-out}.input.svelte-bbsv3q::placeholder{color:currentColor;opacity:50%;transition:opacity var(--agnostic-timing-fast) ease-out}.input.svelte-bbsv3q::-ms-placeholder{color:currentColor;opacity:50%;transition:opacity var(--agnostic-timing-fast) ease-out}.input.svelte-bbsv3q:-ms-placeholder{color:currentColor;opacity:50%;transition:opacity var(--agnostic-timing-fast) ease-out}.input-underlined.svelte-bbsv3q{border-top:0;border-left:0;border-right:0;border-color:var(--agnostic-input-underlined-color, var(--agnostic-gray-mid-dark));background-color:transparent}.input-underlined-bg.svelte-bbsv3q{background-color:var(--agnostic-input-underlined-bg-color, var(--agnostic-gray-extra-light))}.input-rounded.svelte-bbsv3q{border-radius:var(--agnostic-radius, 0.25rem)}.label-error.svelte-bbsv3q{color:var(--agnostic-input-error-color, var(--agnostic-error))}.input-error.svelte-bbsv3q{border-color:var(--agnostic-input-error-color, var(--agnostic-error))}.label-error.svelte-bbsv3q,.field-error.svelte-bbsv3q,.field-error-small.svelte-bbsv3q,.field-error-large.svelte-bbsv3q{color:var(--agnostic-input-error-color, var(--agnostic-error))}.field-help.svelte-bbsv3q,.field-help-small.svelte-bbsv3q,.field-help-large.svelte-bbsv3q{color:var(--agnostic-input-help-color, var(--agnostic-gray-dark))}.field-help.svelte-bbsv3q,.field-help-small.svelte-bbsv3q,.field-help-large.svelte-bbsv3q,.field-error.svelte-bbsv3q,.field-error-small.svelte-bbsv3q,.field-error-large.svelte-bbsv3q{display:inline-block;width:100%;margin-block-start:calc(var(--agnostic-input-vertical-pad, 0.5rem) / 2)}.input-large.svelte-bbsv3q{font-size:calc(var(--agnostic-font-size, 1rem) + 0.25rem);line-height:1.6rem}.field-help-large.svelte-bbsv3q,.field-error-large.svelte-bbsv3q,.label-large.svelte-bbsv3q{font-size:var(--agnostic-font-size, 1rem)}.input-small.svelte-bbsv3q{font-size:calc(var(--agnostic-font-size, 1rem) - 0.25rem);line-height:1rem}.field-help-small.svelte-bbsv3q,.field-error-small.svelte-bbsv3q,.label-small.svelte-bbsv3q{font-size:calc(var(--agnostic-font-size, 1rem) - 0.25rem)}.input.svelte-bbsv3q:focus{box-shadow:0 0 0 var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-color);outline:var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-outline-style)\n    var(--agnostic-focus-ring-outline-color);transition:box-shadow var(--agnostic-timing-fast) ease-out}.input-error.svelte-bbsv3q:focus{box-shadow:0 0 0 3px transparent}.input.disabled.svelte-bbsv3q,.input.svelte-bbsv3q:disabled{background:var(--agnostic-input-disabled-bg, var(--agnostic-disabled-bg)) !important;color:var(--agnostic-input-disabled-color, var(--agnostic-disabled-color)) !important;appearance:none !important;box-shadow:none !important;cursor:not-allowed !important;opacity:80% !important}@media screen and (-ms-high-contrast: active){.input.svelte-bbsv3q:disabled{outline:2px solid transparent;outline-offset:-2px}}.input-addon-container.svelte-bbsv3q{display:flex;position:relative;width:100%;--addon-padding:calc(var(--agnostic-input-side-padding, 0.75rem) * 1.5)}.input-has-left-addon.svelte-bbsv3q,.input-has-right-addon.svelte-bbsv3q{flex:1}.input-has-left-addon.svelte-bbsv3q{padding-inline-start:calc(var(--addon-padding) * 2.25)}.input-has-right-addon.svelte-bbsv3q{padding-inline-end:calc(var(--addon-padding) * 2.25)}@media(prefers-reduced-motion){.input-skin.svelte-bbsv3q,.input.svelte-bbsv3q,.input.svelte-bbsv3q::placeholder,.input.svelte-bbsv3q::-webkit-input-placeholder,.input.svelte-bbsv3q::-ms-placeholder,.input.svelte-bbsv3q:-ms-placeholder,.input.svelte-bbsv3q:focus{transition-duration:0.001ms !important}}";
    	append(document.head, style);
    }

    const get_addonRight_slot_changes = dirty => ({});
    const get_addonRight_slot_context = ctx => ({});
    const get_addonLeft_slot_changes = dirty => ({});
    const get_addonLeft_slot_context = ctx => ({});

    // (429:2) {:else}
    function create_else_block$1(ctx) {
    	let input;
    	let input_type_value;
    	let input_class_value;
    	let mounted;
    	let dispose;

    	let input_levels = [
    		{ id: /*id*/ ctx[3] },
    		{
    			type: input_type_value = /*getInputType*/ ctx[15]()
    		},
    		{ value: /*value*/ ctx[0] },
    		{
    			class: input_class_value = /*inputClasses*/ ctx[11]()
    		},
    		{ disabled: /*isDisabled*/ ctx[9] },
    		/*$$restProps*/ ctx[16]
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	return {
    		c() {
    			input = element("input");
    			set_attributes(input, input_data);
    			toggle_class(input, "svelte-bbsv3q", true);
    		},
    		m(target, anchor) {
    			insert(target, input, anchor);
    			input.value = input_data.value;

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_2*/ ctx[37]),
    					listen(input, "change", /*change_handler_2*/ ctx[38]),
    					listen(input, "input", /*input_handler_2*/ ctx[39]),
    					listen(input, "click", /*click_handler_2*/ ctx[40]),
    					listen(input, "focus", /*focus_handler_2*/ ctx[41])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				dirty[0] & /*id*/ 8 && { id: /*id*/ ctx[3] },
    				{ type: input_type_value },
    				dirty[0] & /*value*/ 1 && input.value !== /*value*/ ctx[0] && { value: /*value*/ ctx[0] },
    				{ class: input_class_value },
    				dirty[0] & /*isDisabled*/ 512 && { disabled: /*isDisabled*/ ctx[9] },
    				dirty[0] & /*$$restProps*/ 65536 && /*$$restProps*/ ctx[16]
    			]));

    			if ('value' in input_data) {
    				input.value = input_data.value;
    			}

    			toggle_class(input, "svelte-bbsv3q", true);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (411:42) 
    function create_if_block_3(ctx) {
    	let div;
    	let t0;
    	let input;
    	let input_type_value;
    	let input_class_value;
    	let t1;
    	let current;
    	let mounted;
    	let dispose;
    	const addonLeft_slot_template = /*#slots*/ ctx[26].addonLeft;
    	const addonLeft_slot = create_slot(addonLeft_slot_template, ctx, /*$$scope*/ ctx[25], get_addonLeft_slot_context);

    	let input_levels = [
    		{ id: /*id*/ ctx[3] },
    		{ value: /*value*/ ctx[0] },
    		{
    			type: input_type_value = /*getInputType*/ ctx[15]()
    		},
    		{
    			class: input_class_value = /*inputClasses*/ ctx[11]()
    		},
    		{ disabled: /*isDisabled*/ ctx[9] },
    		/*$$restProps*/ ctx[16]
    	];

    	let input_data = {};

    	for (let i = 0; i < input_levels.length; i += 1) {
    		input_data = assign(input_data, input_levels[i]);
    	}

    	const addonRight_slot_template = /*#slots*/ ctx[26].addonRight;
    	const addonRight_slot = create_slot(addonRight_slot_template, ctx, /*$$scope*/ ctx[25], get_addonRight_slot_context);

    	return {
    		c() {
    			div = element("div");
    			if (addonLeft_slot) addonLeft_slot.c();
    			t0 = space();
    			input = element("input");
    			t1 = space();
    			if (addonRight_slot) addonRight_slot.c();
    			set_attributes(input, input_data);
    			toggle_class(input, "svelte-bbsv3q", true);
    			attr(div, "class", "" + (null_to_empty(/*addonContainerClasses*/ ctx[14]()) + " svelte-bbsv3q"));
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (addonLeft_slot) {
    				addonLeft_slot.m(div, null);
    			}

    			append(div, t0);
    			append(div, input);
    			input.value = input_data.value;
    			append(div, t1);

    			if (addonRight_slot) {
    				addonRight_slot.m(div, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(input, "blur", /*blur_handler_1*/ ctx[32]),
    					listen(input, "change", /*change_handler_1*/ ctx[33]),
    					listen(input, "input", /*input_handler_1*/ ctx[34]),
    					listen(input, "click", /*click_handler_1*/ ctx[35]),
    					listen(input, "focus", /*focus_handler_1*/ ctx[36])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (addonLeft_slot) {
    				if (addonLeft_slot.p && (!current || dirty[0] & /*$$scope*/ 33554432)) {
    					update_slot(addonLeft_slot, addonLeft_slot_template, ctx, /*$$scope*/ ctx[25], !current ? [-1, -1] : dirty, get_addonLeft_slot_changes, get_addonLeft_slot_context);
    				}
    			}

    			set_attributes(input, input_data = get_spread_update(input_levels, [
    				(!current || dirty[0] & /*id*/ 8) && { id: /*id*/ ctx[3] },
    				(!current || dirty[0] & /*value*/ 1 && input.value !== /*value*/ ctx[0]) && { value: /*value*/ ctx[0] },
    				{ type: input_type_value },
    				{ class: input_class_value },
    				(!current || dirty[0] & /*isDisabled*/ 512) && { disabled: /*isDisabled*/ ctx[9] },
    				dirty[0] & /*$$restProps*/ 65536 && /*$$restProps*/ ctx[16]
    			]));

    			if ('value' in input_data) {
    				input.value = input_data.value;
    			}

    			toggle_class(input, "svelte-bbsv3q", true);

    			if (addonRight_slot) {
    				if (addonRight_slot.p && (!current || dirty[0] & /*$$scope*/ 33554432)) {
    					update_slot(addonRight_slot, addonRight_slot_template, ctx, /*$$scope*/ ctx[25], !current ? [-1, -1] : dirty, get_addonRight_slot_changes, get_addonRight_slot_context);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(addonLeft_slot, local);
    			transition_in(addonRight_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(addonLeft_slot, local);
    			transition_out(addonRight_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (addonLeft_slot) addonLeft_slot.d(detaching);
    			if (addonRight_slot) addonRight_slot.d(detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (399:2) {#if type == 'textarea'}
    function create_if_block_2(ctx) {
    	let textarea;
    	let textarea_class_value;
    	let mounted;
    	let dispose;

    	let textarea_levels = [
    		{ id: /*id*/ ctx[3] },
    		{ value: /*value*/ ctx[0] },
    		{
    			class: textarea_class_value = /*inputClasses*/ ctx[11]()
    		},
    		/*$$restProps*/ ctx[16]
    	];

    	let textarea_data = {};

    	for (let i = 0; i < textarea_levels.length; i += 1) {
    		textarea_data = assign(textarea_data, textarea_levels[i]);
    	}

    	return {
    		c() {
    			textarea = element("textarea");
    			set_attributes(textarea, textarea_data);
    			toggle_class(textarea, "svelte-bbsv3q", true);
    		},
    		m(target, anchor) {
    			insert(target, textarea, anchor);

    			if (!mounted) {
    				dispose = [
    					listen(textarea, "blur", /*blur_handler*/ ctx[27]),
    					listen(textarea, "change", /*change_handler*/ ctx[28]),
    					listen(textarea, "input", /*input_handler*/ ctx[29]),
    					listen(textarea, "click", /*click_handler*/ ctx[30]),
    					listen(textarea, "focus", /*focus_handler*/ ctx[31])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			set_attributes(textarea, textarea_data = get_spread_update(textarea_levels, [
    				dirty[0] & /*id*/ 8 && { id: /*id*/ ctx[3] },
    				dirty[0] & /*value*/ 1 && { value: /*value*/ ctx[0] },
    				{ class: textarea_class_value },
    				dirty[0] & /*$$restProps*/ 65536 && /*$$restProps*/ ctx[16]
    			]));

    			toggle_class(textarea, "svelte-bbsv3q", true);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(textarea);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (448:21) 
    function create_if_block_1$2(ctx) {
    	let span;
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(/*helpText*/ ctx[4]);
    			attr(span, "class", "" + (null_to_empty(/*helpClasses*/ ctx[13]()) + " svelte-bbsv3q"));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*helpText*/ 16) set_data(t, /*helpText*/ ctx[4]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (444:2) {#if isInvalid}
    function create_if_block$3(ctx) {
    	let span;
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(/*invalidText*/ ctx[5]);
    			attr(span, "role", "status");
    			attr(span, "aria-live", "polite");
    			attr(span, "class", "" + (null_to_empty(/*invalidClasses*/ ctx[12]()) + " svelte-bbsv3q"));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*invalidText*/ 32) set_data(t, /*invalidText*/ ctx[5]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let div;
    	let label_1;
    	let t0;
    	let t1;
    	let current_block_type_index;
    	let if_block0;
    	let t2;
    	let current;
    	const if_block_creators = [create_if_block_2, create_if_block_3, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*type*/ ctx[1] == 'textarea') return 0;
    		if (/*hasLeftAddon*/ ctx[6] || /*hasRightAddon*/ ctx[7]) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	function select_block_type_1(ctx, dirty) {
    		if (/*isInvalid*/ ctx[8]) return create_if_block$3;
    		if (/*helpText*/ ctx[4]) return create_if_block_1$2;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block1 = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			div = element("div");
    			label_1 = element("label");
    			t0 = text(/*label*/ ctx[2]);
    			t1 = space();
    			if_block0.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			attr(label_1, "class", "" + (null_to_empty(/*labelClasses*/ ctx[10]()) + " svelte-bbsv3q"));
    			attr(label_1, "for", /*id*/ ctx[3]);
    			attr(div, "class", "w-100");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, label_1);
    			append(label_1, t0);
    			append(div, t1);
    			if_blocks[current_block_type_index].m(div, null);
    			append(div, t2);
    			if (if_block1) if_block1.m(div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (!current || dirty[0] & /*label*/ 4) set_data(t0, /*label*/ ctx[2]);

    			if (!current || dirty[0] & /*id*/ 8) {
    				attr(label_1, "for", /*id*/ ctx[3]);
    			}

    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block0 = if_blocks[current_block_type_index];

    				if (!if_block0) {
    					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block0.c();
    				} else {
    					if_block0.p(ctx, dirty);
    				}

    				transition_in(if_block0, 1);
    				if_block0.m(div, t2);
    			}

    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block1) {
    				if_block1.p(ctx, dirty);
    			} else {
    				if (if_block1) if_block1.d(1);
    				if_block1 = current_block_type && current_block_type(ctx);

    				if (if_block1) {
    					if_block1.c();
    					if_block1.m(div, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block0);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if_blocks[current_block_type_index].d();

    			if (if_block1) {
    				if_block1.d();
    			}
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	const omit_props_names = [
    		"label","id","labelCss","helpText","invalidText","hasLeftAddon","hasRightAddon","isInvalid","isInline","isRounded","isDisabled","css","isSkinned","isUnderlinedWithBackground","isUnderlined","size","value","type"
    	];

    	let $$restProps = compute_rest_props($$props, omit_props_names);
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const TYPES = ["text", "password", "email", "number", "url", "tel", "search", "textarea"];
    	let { label = "" } = $$props;
    	let { id = "" } = $$props;
    	let { labelCss = "" } = $$props;
    	let { helpText = "" } = $$props;
    	let { invalidText = "" } = $$props;
    	let { hasLeftAddon = false } = $$props;
    	let { hasRightAddon = false } = $$props;
    	let { isInvalid = false } = $$props;
    	let { isInline = false } = $$props;
    	let { isRounded = false } = $$props;
    	let { isDisabled = undefined } = $$props;
    	let { css = "" } = $$props;
    	let { isSkinned = true } = $$props;
    	let { isUnderlinedWithBackground = false } = $$props;
    	let { isUnderlined = false } = $$props;
    	let { size = "" } = $$props;
    	let { value = "" } = $$props;
    	let { type = "text" } = $$props;

    	const labelClasses = () => {
    		let labelKlasses = [
    			"label",
    			isInvalid ? "label-error" : "",
    			isInline ? "label-inline" : "",
    			size ? `label-${size}` : "",
    			labelCss ? labelCss : ""
    		];

    		labelKlasses = labelKlasses.filter(klass => klass.length);
    		labelKlasses = labelKlasses.join(" ");
    		return labelKlasses;
    	};

    	const inputClasses = () => {
    		let inputKlasses = [
    			isSkinned ? "input" : "input-base",
    			isRounded ? "input-rounded" : "",
    			isUnderlined ? "input-underlined" : "",
    			hasLeftAddon ? "input-has-left-addon" : "",
    			hasRightAddon ? "input-has-right-addon" : "",
    			isDisabled ? "disabled" : "",
    			isInvalid ? "input-error" : "",
    			isInline ? "input-inline" : "",
    			isUnderlinedWithBackground ? "input-underlined-bg" : "",
    			css ? css : "",
    			size ? `input-${size}` : ""
    		];

    		inputKlasses = inputKlasses.filter(klass => klass.length);
    		inputKlasses = inputKlasses.join(" ");
    		return inputKlasses;
    	};

    	const invalidClasses = () => {
    		return size ? `field-error-${size}` : "field-error";
    	};

    	const helpClasses = () => {
    		return size ? `field-help-${size}` : "field-help";
    	};

    	const addonContainerClasses = () => "input-addon-container";

    	const getInputType = () => {
    		if (!TYPES.includes(type)) {
    			console.warn(`allowed types are ${TYPES}`);
    			$$invalidate(1, type = "text");
    		}

    		return type;
    	};

    	function blur_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function change_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function input_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	function blur_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function change_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function input_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler_1(event) {
    		bubble.call(this, $$self, event);
    	}

    	function blur_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function change_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function input_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function click_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	function focus_handler_2(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$new_props => {
    		$$props = assign(assign({}, $$props), exclude_internal_props($$new_props));
    		$$invalidate(16, $$restProps = compute_rest_props($$props, omit_props_names));
    		if ('label' in $$new_props) $$invalidate(2, label = $$new_props.label);
    		if ('id' in $$new_props) $$invalidate(3, id = $$new_props.id);
    		if ('labelCss' in $$new_props) $$invalidate(17, labelCss = $$new_props.labelCss);
    		if ('helpText' in $$new_props) $$invalidate(4, helpText = $$new_props.helpText);
    		if ('invalidText' in $$new_props) $$invalidate(5, invalidText = $$new_props.invalidText);
    		if ('hasLeftAddon' in $$new_props) $$invalidate(6, hasLeftAddon = $$new_props.hasLeftAddon);
    		if ('hasRightAddon' in $$new_props) $$invalidate(7, hasRightAddon = $$new_props.hasRightAddon);
    		if ('isInvalid' in $$new_props) $$invalidate(8, isInvalid = $$new_props.isInvalid);
    		if ('isInline' in $$new_props) $$invalidate(18, isInline = $$new_props.isInline);
    		if ('isRounded' in $$new_props) $$invalidate(19, isRounded = $$new_props.isRounded);
    		if ('isDisabled' in $$new_props) $$invalidate(9, isDisabled = $$new_props.isDisabled);
    		if ('css' in $$new_props) $$invalidate(20, css = $$new_props.css);
    		if ('isSkinned' in $$new_props) $$invalidate(21, isSkinned = $$new_props.isSkinned);
    		if ('isUnderlinedWithBackground' in $$new_props) $$invalidate(22, isUnderlinedWithBackground = $$new_props.isUnderlinedWithBackground);
    		if ('isUnderlined' in $$new_props) $$invalidate(23, isUnderlined = $$new_props.isUnderlined);
    		if ('size' in $$new_props) $$invalidate(24, size = $$new_props.size);
    		if ('value' in $$new_props) $$invalidate(0, value = $$new_props.value);
    		if ('type' in $$new_props) $$invalidate(1, type = $$new_props.type);
    		if ('$$scope' in $$new_props) $$invalidate(25, $$scope = $$new_props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*value*/ 1) {
    			if (!value) $$invalidate(0, value = "");
    		}
    	};

    	return [
    		value,
    		type,
    		label,
    		id,
    		helpText,
    		invalidText,
    		hasLeftAddon,
    		hasRightAddon,
    		isInvalid,
    		isDisabled,
    		labelClasses,
    		inputClasses,
    		invalidClasses,
    		helpClasses,
    		addonContainerClasses,
    		getInputType,
    		$$restProps,
    		labelCss,
    		isInline,
    		isRounded,
    		css,
    		isSkinned,
    		isUnderlinedWithBackground,
    		isUnderlined,
    		size,
    		$$scope,
    		slots,
    		blur_handler,
    		change_handler,
    		input_handler,
    		click_handler,
    		focus_handler,
    		blur_handler_1,
    		change_handler_1,
    		input_handler_1,
    		click_handler_1,
    		focus_handler_1,
    		blur_handler_2,
    		change_handler_2,
    		input_handler_2,
    		click_handler_2,
    		focus_handler_2
    	];
    }

    class Input extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-bbsv3q-style")) add_css$6();

    		init(
    			this,
    			options,
    			instance$6,
    			create_fragment$6,
    			safe_not_equal,
    			{
    				label: 2,
    				id: 3,
    				labelCss: 17,
    				helpText: 4,
    				invalidText: 5,
    				hasLeftAddon: 6,
    				hasRightAddon: 7,
    				isInvalid: 8,
    				isInline: 18,
    				isRounded: 19,
    				isDisabled: 9,
    				css: 20,
    				isSkinned: 21,
    				isUnderlinedWithBackground: 22,
    				isUnderlined: 23,
    				size: 24,
    				value: 0,
    				type: 1
    			},
    			[-1, -1]
    		);
    	}
    }

    var Input$1 = Input;

    /* src/stories/InputAddonItem.svelte generated by Svelte v3.39.0 */

    function add_css$5() {
    	var style = element("style");
    	style.id = "svelte-15wxyuz-style";
    	style.textContent = ".input-addon-right.svelte-15wxyuz,.input-addon-left.svelte-15wxyuz{display:flex;align-items:center;justify-content:center;position:absolute;top:0;height:2.375rem}.input-addon-left.svelte-15wxyuz{left:var(--addon-padding)}.input-addon-right.svelte-15wxyuz{right:var(--addon-padding)}";
    	append(document.head, style);
    }

    function create_fragment$5(ctx) {
    	let div;
    	let div_class_value;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[5].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);

    	return {
    		c() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr(div, "class", div_class_value = "" + (null_to_empty(/*klasses*/ ctx[0]) + " svelte-15wxyuz"));
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 16)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[4], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*klasses*/ 1 && div_class_value !== (div_class_value = "" + (null_to_empty(/*klasses*/ ctx[0]) + " svelte-15wxyuz"))) {
    				attr(div, "class", div_class_value);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { css = "" } = $$props;
    	let { addonLeft = false } = $$props;
    	let { addonRight = false } = $$props;

    	let klasses = [
    		addonLeft ? "input-addon-left" : "",
    		addonRight ? "input-addon-right" : "",
    		css ? `${css}` : ""
    	];

    	klasses = klasses.filter(klass => klass.length);
    	klasses = klasses.join(" ");

    	$$self.$$set = $$props => {
    		if ('css' in $$props) $$invalidate(1, css = $$props.css);
    		if ('addonLeft' in $$props) $$invalidate(2, addonLeft = $$props.addonLeft);
    		if ('addonRight' in $$props) $$invalidate(3, addonRight = $$props.addonRight);
    		if ('$$scope' in $$props) $$invalidate(4, $$scope = $$props.$$scope);
    	};

    	return [klasses, css, addonLeft, addonRight, $$scope, slots];
    }

    class InputAddonItem extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-15wxyuz-style")) add_css$5();
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { css: 1, addonLeft: 2, addonRight: 3 });
    	}
    }

    var InputAddonItem$1 = InputAddonItem;

    /* src/stories/Progress.svelte generated by Svelte v3.39.0 */

    function add_css$4() {
    	var style = element("style");
    	style.id = "svelte-1eh41dz-style";
    	style.textContent = ".progress.svelte-1eh41dz{appearance:none;height:var(--agnostic-progress-height, var(--fluid-10, 0.625rem));width:100%;border:none;background-color:var(--agnostic-progress-background, var(--agnostic-gray-light, #ededed));border-radius:var(--agnostic-progress-radius, var(--fluid-10, 0.625rem))}.progress[value].svelte-1eh41dz::-webkit-progress-bar{background-color:var(--agnostic-progress-background, var(--agnostic-gray-light, #ededed));border-radius:var(--agnostic-progress-radius, var(--fluid-10, 0.625rem))}.progress[value].svelte-1eh41dz::-webkit-progress-value{background-color:var(--agnostic-progress-fill-color, var(--agnostic-primary, #077acb));border-radius:var(--agnostic-progress-radius, var(--fluid-10, 0.625rem))}.progress[value].svelte-1eh41dz::-moz-progress-bar{background-color:var(--agnostic-progress-fill-color, var(--agnostic-primary, #077acb));border-radius:var(--agnostic-progress-radius, var(--fluid-10, 0.625rem))}.progress[value].svelte-1eh41dz::-ms-fill{background-color:var(--agnostic-progress-fill-color, var(--agnostic-primary, #077acb));border-radius:var(--agnostic-progress-radius, var(--fluid-10, 0.625rem))}";
    	append(document.head, style);
    }

    function create_fragment$4(ctx) {
    	let progress;
    	let progress_class_value;

    	return {
    		c() {
    			progress = element("progress");
    			attr(progress, "class", progress_class_value = "" + (null_to_empty(/*klasses*/ ctx[2]) + " svelte-1eh41dz"));
    			progress.value = /*value*/ ctx[0];
    			attr(progress, "max", /*max*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, progress, anchor);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*klasses*/ 4 && progress_class_value !== (progress_class_value = "" + (null_to_empty(/*klasses*/ ctx[2]) + " svelte-1eh41dz"))) {
    				attr(progress, "class", progress_class_value);
    			}

    			if (dirty & /*value*/ 1) {
    				progress.value = /*value*/ ctx[0];
    			}

    			if (dirty & /*max*/ 2) {
    				attr(progress, "max", /*max*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(progress);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { value = 0 } = $$props;
    	let { max } = $$props;
    	let { css = "" } = $$props;
    	let klasses = ["progress", css ? `${css}` : ""];
    	klasses = klasses.filter(klass => klass.length);
    	klasses = klasses.join(" ");

    	$$self.$$set = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    		if ('max' in $$props) $$invalidate(1, max = $$props.max);
    		if ('css' in $$props) $$invalidate(3, css = $$props.css);
    	};

    	return [value, max, klasses, css];
    }

    class Progress extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1eh41dz-style")) add_css$4();
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { value: 0, max: 1, css: 3 });
    	}
    }

    var Progress$1 = Progress;

    /* src/stories/Select.svelte generated by Svelte v3.39.0 */

    function add_css$3() {
    	var style = element("style");
    	style.id = "svelte-uagxch-style";
    	style.textContent = ".select.svelte-uagxch,.select-base.svelte-uagxch{display:block;width:100%;-webkit-appearance:none;-moz-appearance:none;appearance:none}.select.svelte-uagxch,.select-skin.svelte-uagxch{padding:var(--fluid-6) var(--fluid-32) var(--fluid-6) var(--fluid-12);-moz-padding-start:calc(var(--fluid-12) - 3px);font-size:var(--fluid-16);font-weight:400;line-height:1.5;color:var(--agnostic-dark);background-color:white;background-image:url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23333330' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e\");background-repeat:no-repeat;background-position:right var(--fluid-12) center;background-size:var(--fluid-16) var(--fluid-12);border:1px solid var(--agnostic-checkbox-border-color, var(--agnostic-gray-light));border-radius:var(--agnostic-radius);transition:border-color var(--agnostic-timing-fast) ease-in-out,\n    box-shadow var(--agnostic-timing-fast) ease-in-out}.select.svelte-uagxch:focus{border-color:var(--agnostic-focus-ring-color);box-shadow:0 0 0 var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-color);outline:var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-outline-style)\n    var(--agnostic-focus-ring-outline-color);transition:box-shadow var(--agnostic-timing-fast) ease-out}.select-base.svelte-uagxch,.select.svelte-uagxch:disabled{background-color:var(--agnostic-disabled-bg)}.select-base.svelte-uagxch,.select.svelte-uagxch:-moz-focusring{color:transparent;text-shadow:0 0 0 var(--agnostic-dark)}@media(prefers-reduced-motion: reduce){.select.svelte-uagxch,.select-base.svelte-uagxch,.select.svelte-uagxch:focus{transition:none}}.select-small.svelte-uagxch{padding-top:var(--fluid-4);padding-bottom:var(--fluid-4);padding-left:var(--fluid-8);font-size:var(--fluid-14)}.select-large.svelte-uagxch{padding-top:var(--fluid-8);padding-bottom:var(--fluid-8);padding-left:var(--fluid-16);font-size:var(--fluid-18)}";
    	append(document.head, style);
    }

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[17] = list[i].value;
    	child_ctx[18] = list[i].label;
    	child_ctx[20] = i;
    	return child_ctx;
    }

    // (124:2) {#if showDefaultOption}
    function create_if_block$2(ctx) {
    	let option;
    	let t0;
    	let t1;

    	return {
    		c() {
    			option = element("option");
    			t0 = text(/*defaultOptionLabel*/ ctx[4]);
    			t1 = space();
    			option.__value = "select-option";
    			option.value = option.__value;
    			option.disabled = true;
    			option.selected = true;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t0);
    			append(option, t1);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*defaultOptionLabel*/ 16) set_data(t0, /*defaultOptionLabel*/ ctx[4]);
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    // (129:2) {#each options as { value, label }
    function create_each_block$1(ctx) {
    	let option;
    	let t_value = /*label*/ ctx[18] + "";
    	let t;
    	let option_value_value;

    	return {
    		c() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = /*value*/ ctx[17];
    			option.value = option.__value;
    		},
    		m(target, anchor) {
    			insert(target, option, anchor);
    			append(option, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*options*/ 8 && t_value !== (t_value = /*label*/ ctx[18] + "")) set_data(t, t_value);

    			if (dirty & /*options*/ 8 && option_value_value !== (option_value_value = /*value*/ ctx[17])) {
    				option.__value = option_value_value;
    				option.value = option.__value;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(option);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let label;
    	let t0;
    	let t1;
    	let select;
    	let if_block_anchor;
    	let mounted;
    	let dispose;
    	let if_block = /*showDefaultOption*/ ctx[9] && create_if_block$2(ctx);
    	let each_value = /*options*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	return {
    		c() {
    			label = element("label");
    			t0 = text(/*labelCopy*/ ctx[2]);
    			t1 = space();
    			select = element("select");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(label, "class", "screenreader-only");
    			attr(label, "for", /*uniqueId*/ ctx[0]);
    			attr(select, "id", /*uniqueId*/ ctx[0]);
    			attr(select, "class", "" + (null_to_empty(/*classes*/ ctx[8]) + " svelte-uagxch"));
    			attr(select, "name", /*name*/ ctx[1]);
    			select.disabled = /*isDisabled*/ ctx[5];
    			if (/*selected*/ ctx[6] === void 0) add_render_callback(() => /*select_change_handler*/ ctx[15].call(select));
    		},
    		m(target, anchor) {
    			insert(target, label, anchor);
    			append(label, t0);
    			insert(target, t1, anchor);
    			insert(target, select, anchor);
    			if (if_block) if_block.m(select, null);
    			append(select, if_block_anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}

    			select_option(select, /*selected*/ ctx[6]);

    			if (!mounted) {
    				dispose = [
    					listen(select, "change", /*select_change_handler*/ ctx[15]),
    					listen(select, "change", /*changeHandler*/ ctx[7])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*labelCopy*/ 4) set_data(t0, /*labelCopy*/ ctx[2]);

    			if (dirty & /*uniqueId*/ 1) {
    				attr(label, "for", /*uniqueId*/ ctx[0]);
    			}

    			if (/*showDefaultOption*/ ctx[9]) if_block.p(ctx, dirty);

    			if (dirty & /*options*/ 8) {
    				each_value = /*options*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*uniqueId*/ 1) {
    				attr(select, "id", /*uniqueId*/ ctx[0]);
    			}

    			if (dirty & /*name*/ 2) {
    				attr(select, "name", /*name*/ ctx[1]);
    			}

    			if (dirty & /*isDisabled*/ 32) {
    				select.disabled = /*isDisabled*/ ctx[5];
    			}

    			if (dirty & /*selected, options*/ 72) {
    				select_option(select, /*selected*/ ctx[6]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(label);
    			if (detaching) detach(t1);
    			if (detaching) detach(select);
    			if (if_block) if_block.d();
    			destroy_each(each_blocks, detaching);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { uniqueId = "" } = $$props;
    	let { name = "" } = $$props;
    	let { labelCopy = "" } = $$props;
    	let { options = [] } = $$props;
    	let { size = "" } = $$props;
    	let { multipleSize = 1 } = $$props;
    	let { isMultiple = false } = $$props;
    	let { defaultOptionLabel = "Please select an option" } = $$props;
    	let { isDisabled = false } = $$props;
    	let { isSkinned = true } = $$props;
    	let { css = "" } = $$props;
    	let selected;
    	const dispatch = createEventDispatcher();

    	// This will emit an event object that has a event.detail prop
    	// This will contain the value of the selected option value. See
    	// https://svelte.dev/docs#createEventDispatcher
    	const changeHandler = () => {
    		dispatch('selected', selected);
    	};

    	const classes = [
    		isSkinned ? "select" : "select-base",
    		size ? `select-${size}` : '',
    		css ? `${css}` : ''
    	].filter(cl => cl).join(' ');

    	const showDefaultOption = !isMultiple;

    	function select_change_handler() {
    		selected = select_value(this);
    		$$invalidate(6, selected);
    		$$invalidate(3, options);
    	}

    	$$self.$$set = $$props => {
    		if ('uniqueId' in $$props) $$invalidate(0, uniqueId = $$props.uniqueId);
    		if ('name' in $$props) $$invalidate(1, name = $$props.name);
    		if ('labelCopy' in $$props) $$invalidate(2, labelCopy = $$props.labelCopy);
    		if ('options' in $$props) $$invalidate(3, options = $$props.options);
    		if ('size' in $$props) $$invalidate(10, size = $$props.size);
    		if ('multipleSize' in $$props) $$invalidate(11, multipleSize = $$props.multipleSize);
    		if ('isMultiple' in $$props) $$invalidate(12, isMultiple = $$props.isMultiple);
    		if ('defaultOptionLabel' in $$props) $$invalidate(4, defaultOptionLabel = $$props.defaultOptionLabel);
    		if ('isDisabled' in $$props) $$invalidate(5, isDisabled = $$props.isDisabled);
    		if ('isSkinned' in $$props) $$invalidate(13, isSkinned = $$props.isSkinned);
    		if ('css' in $$props) $$invalidate(14, css = $$props.css);
    	};

    	return [
    		uniqueId,
    		name,
    		labelCopy,
    		options,
    		defaultOptionLabel,
    		isDisabled,
    		selected,
    		changeHandler,
    		classes,
    		showDefaultOption,
    		size,
    		multipleSize,
    		isMultiple,
    		isSkinned,
    		css,
    		select_change_handler
    	];
    }

    class Select extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-uagxch-style")) add_css$3();

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			uniqueId: 0,
    			name: 1,
    			labelCopy: 2,
    			options: 3,
    			size: 10,
    			multipleSize: 11,
    			isMultiple: 12,
    			defaultOptionLabel: 4,
    			isDisabled: 5,
    			isSkinned: 13,
    			css: 14
    		});
    	}
    }

    var Select$1 = Select;

    /* src/stories/Switch.svelte generated by Svelte v3.39.0 */

    function add_css$2() {
    	var style = element("style");
    	style.id = "svelte-1wzsqqv-style";
    	style.textContent = ".switch-container.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv{display:block;min-height:2.25rem;width:100%;padding:0.5rem;position:relative}.switch-container.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv:hover{cursor:pointer}.switch.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::before,.switch.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::after{border:1px solid var(--agnostic-gray-mid-dark);content:\"\";position:absolute;top:50%;transform:translateY(-50%)}.switch.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::after{background:#fff;border-radius:100%;width:1.4rem;height:1.4rem;right:1.4rem;transition:right var(--agnostic-timing-fast) ease-in-out}.switch.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::before{background:#eee;border-radius:1.75rem;width:2.75rem;height:1.75rem;right:0.25rem;transition:background var(--agnostic-timing-medium) ease-in-out}.switch-small.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::after{width:1.25rem;height:1.25rem;right:1.125rem}.switch-small.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::before{width:2.25rem;height:1.5rem}.switch-large.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::after{width:1.65rem;height:1.65rem;right:1.65rem}.switch-large.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::before{width:3.25rem;height:2rem}.switch-border.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::before{border:1px solid var(--agnostic-primary)}.switch-action.switch-border.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::before{border:1px solid var(--agnostic-action)}.switch-right.svelte-1wzsqqv .switch.svelte-1wzsqqv.svelte-1wzsqqv::before{right:initial;left:0.25rem}.switch-right.svelte-1wzsqqv .switch.svelte-1wzsqqv.svelte-1wzsqqv::after{right:initial;left:1.4rem}.switch-right.svelte-1wzsqqv .switch-small.svelte-1wzsqqv.svelte-1wzsqqv::after{left:1.125rem}.switch-right.svelte-1wzsqqv .switch-large.svelte-1wzsqqv.svelte-1wzsqqv::after{left:1.65rem}.switch-input.svelte-1wzsqqv:checked+.switch-small.svelte-1wzsqqv.svelte-1wzsqqv::after{right:0.425rem}.switch-input.svelte-1wzsqqv:checked+.switch.svelte-1wzsqqv.svelte-1wzsqqv::after{right:0.5em}.switch-right.svelte-1wzsqqv .switch-label.svelte-1wzsqqv.svelte-1wzsqqv{position:absolute;right:0;transition:left var(--agnostic-timing-fast) ease-in-out}.switch-right.svelte-1wzsqqv .switch-input.svelte-1wzsqqv:checked+.switch.svelte-1wzsqqv::after{right:initial;left:0.5em}.switch-right.svelte-1wzsqqv .switch-input.svelte-1wzsqqv:checked+.switch-small.svelte-1wzsqqv::after{right:initial;left:0.425rem}.switch-input.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv{margin:0;opacity:0.01%;position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}.switch-input.svelte-1wzsqqv:focus+.switch.svelte-1wzsqqv.svelte-1wzsqqv::before{box-shadow:0 0 0 var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-color)}.switch-input.svelte-1wzsqqv:checked+.switch.svelte-1wzsqqv.svelte-1wzsqqv:not(.switch-border)::before{background:var(--agnostic-primary)}.switch-input.svelte-1wzsqqv:checked+.switch-action.svelte-1wzsqqv.svelte-1wzsqqv:not(.switch-border)::before{background:var(--agnostic-action)}.switch-input.svelte-1wzsqqv:checked+.switch-border.svelte-1wzsqqv.svelte-1wzsqqv::after{background:var(--agnostic-primary)}.switch-input.svelte-1wzsqqv:checked+.switch-action.switch-border.svelte-1wzsqqv.svelte-1wzsqqv::after{background:var(--agnostic-action)}.switch-input[disabled].svelte-1wzsqqv+.switch.svelte-1wzsqqv.svelte-1wzsqqv,.switch-input[disabled].svelte-1wzsqqv+.switch-label.svelte-1wzsqqv.svelte-1wzsqqv,.switch-container.disabled.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv{color:var(--agnostic-input-disabled-color, var(--agnostic-disabled-color)) !important;appearance:none !important;box-shadow:none !important;cursor:not-allowed !important;opacity:80% !important}@media screen and (-ms-high-contrast: active){.switch.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::after{background-color:windowText}.switch-input[disabled].svelte-1wzsqqv+.switch-label.svelte-1wzsqqv.svelte-1wzsqqv,.switch-container.disabled.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv{outline:2px solid transparent;outline-offset:-2px}}@media(prefers-reduced-motion){.switch.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::after,.switch.svelte-1wzsqqv.svelte-1wzsqqv.svelte-1wzsqqv::before{transition-duration:0.001ms !important}}";
    	append(document.head, style);
    }

    // (264:2) {#if labelPosition === 'left'}
    function create_if_block_1$1(ctx) {
    	let span;
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(/*label*/ ctx[1]);
    			attr(span, "class", "switch-label svelte-1wzsqqv");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*label*/ 2) set_data(t, /*label*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (277:2) {#if labelPosition === 'right'}
    function create_if_block$1(ctx) {
    	let span;
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(/*label*/ ctx[1]);
    			attr(span, "class", "switch-label svelte-1wzsqqv");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*label*/ 2) set_data(t, /*label*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    function create_fragment$2(ctx) {
    	let label_1;
    	let t0;
    	let input;
    	let t1;
    	let span;
    	let t2;
    	let mounted;
    	let dispose;
    	let if_block0 = /*labelPosition*/ ctx[2] === 'left' && create_if_block_1$1(ctx);
    	let if_block1 = /*labelPosition*/ ctx[2] === 'right' && create_if_block$1(ctx);

    	return {
    		c() {
    			label_1 = element("label");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			input = element("input");
    			t1 = space();
    			span = element("span");
    			t2 = space();
    			if (if_block1) if_block1.c();
    			attr(input, "type", "checkbox");
    			attr(input, "class", "switch-input svelte-1wzsqqv");
    			attr(input, "id", /*id*/ ctx[0]);
    			input.checked = /*isChecked*/ ctx[3];
    			input.disabled = /*isDisabled*/ ctx[4];
    			attr(input, "role", "switch");
    			attr(span, "class", "" + (null_to_empty(/*switchSpan*/ ctx[6]()) + " svelte-1wzsqqv"));
    			attr(span, "aria-hidden", "true");
    			attr(label_1, "class", "" + (null_to_empty(/*switchContainer*/ ctx[5]()) + " svelte-1wzsqqv"));
    			attr(label_1, "for", /*id*/ ctx[0]);
    		},
    		m(target, anchor) {
    			insert(target, label_1, anchor);
    			if (if_block0) if_block0.m(label_1, null);
    			append(label_1, t0);
    			append(label_1, input);
    			append(label_1, t1);
    			append(label_1, span);
    			append(label_1, t2);
    			if (if_block1) if_block1.m(label_1, null);

    			if (!mounted) {
    				dispose = [
    					listen(input, "change", /*change_handler*/ ctx[13]),
    					listen(input, "click", /*handleClick*/ ctx[7]),
    					listen(input, "keypress", /*handleKeypress*/ ctx[8])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*labelPosition*/ ctx[2] === 'left') {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1$1(ctx);
    					if_block0.c();
    					if_block0.m(label_1, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty & /*id*/ 1) {
    				attr(input, "id", /*id*/ ctx[0]);
    			}

    			if (dirty & /*isChecked*/ 8) {
    				input.checked = /*isChecked*/ ctx[3];
    			}

    			if (dirty & /*isDisabled*/ 16) {
    				input.disabled = /*isDisabled*/ ctx[4];
    			}

    			if (/*labelPosition*/ ctx[2] === 'right') {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					if_block1.m(label_1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty & /*id*/ 1) {
    				attr(label_1, "for", /*id*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(label_1);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { id = "" } = $$props;
    	let { label = "" } = $$props;
    	let { css = "" } = $$props;
    	let { labelPosition = "left" } = $$props;
    	let { size = "" } = $$props;
    	let { isChecked = false } = $$props;
    	let { isBordered = false } = $$props;
    	let { isAction = false } = $$props;
    	let { isDisabled = false } = $$props;

    	const switchContainer = () => {
    		let klasses = [
    			"switch-container",
    			labelPosition === "right" ? "switch-right" : "",
    			css ? css : "",
    			isDisabled ? "disabled" : ""
    		];

    		klasses = klasses.filter(klass => klass.length);
    		return klasses.join(" ");
    	};

    	const switchSpan = () => {
    		let klasses = [
    			"switch",
    			isBordered ? "switch-border" : "",
    			isAction ? "switch-action" : "",
    			size ? `switch-${size}` : ""
    		];

    		klasses = klasses.filter(klass => klass.length);
    		return klasses.join(" ");
    	};

    	const handleClick = evt => {
    		const el = evt.target;

    		if (el.getAttribute("aria-checked") == "true") {
    			el.setAttribute("aria-checked", "false");
    		} else {
    			el.setAttribute("aria-checked", "true");
    		}
    	};

    	const handleKeypress = evt => {
    		const keyCode = evt.keyCode || evt.which;

    		switch (keyCode) {
    			case 13:
    				evt.preventDefault();
    				evt.target.click();
    				break;
    		}
    	};

    	function change_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ('id' in $$props) $$invalidate(0, id = $$props.id);
    		if ('label' in $$props) $$invalidate(1, label = $$props.label);
    		if ('css' in $$props) $$invalidate(9, css = $$props.css);
    		if ('labelPosition' in $$props) $$invalidate(2, labelPosition = $$props.labelPosition);
    		if ('size' in $$props) $$invalidate(10, size = $$props.size);
    		if ('isChecked' in $$props) $$invalidate(3, isChecked = $$props.isChecked);
    		if ('isBordered' in $$props) $$invalidate(11, isBordered = $$props.isBordered);
    		if ('isAction' in $$props) $$invalidate(12, isAction = $$props.isAction);
    		if ('isDisabled' in $$props) $$invalidate(4, isDisabled = $$props.isDisabled);
    	};

    	return [
    		id,
    		label,
    		labelPosition,
    		isChecked,
    		isDisabled,
    		switchContainer,
    		switchSpan,
    		handleClick,
    		handleKeypress,
    		css,
    		size,
    		isBordered,
    		isAction,
    		change_handler
    	];
    }

    class Switch extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1wzsqqv-style")) add_css$2();

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			id: 0,
    			label: 1,
    			css: 9,
    			labelPosition: 2,
    			size: 10,
    			isChecked: 3,
    			isBordered: 11,
    			isAction: 12,
    			isDisabled: 4
    		});
    	}
    }

    var Switch$1 = Switch;

    /* src/stories/Tabs.svelte generated by Svelte v3.39.0 */

    function add_css$1() {
    	var style = element("style");
    	style.id = "svelte-1hd1z3c-style";
    	style.textContent = ".tabs.svelte-1hd1z3c.svelte-1hd1z3c{display:flex;flex-direction:column}.tabs-vertical.svelte-1hd1z3c.svelte-1hd1z3c{flex-direction:row}.tab-list.svelte-1hd1z3c.svelte-1hd1z3c,.tab-list-base.svelte-1hd1z3c.svelte-1hd1z3c{display:flex;flex-flow:row wrap;flex:0 0 auto}.tab-list.svelte-1hd1z3c.svelte-1hd1z3c,.tab-skinned.svelte-1hd1z3c.svelte-1hd1z3c{padding-inline-start:0;margin-block-end:0;border-bottom:var(--agnostic-tabs-border-size, 1px) solid\n    var(--agnostic-tabs-bgcolor, var(--agnostic-gray-light));transition-property:all;transition-duration:var(--agnostic-timing-medium)}.tabs-vertical.svelte-1hd1z3c .tab-list.svelte-1hd1z3c,.tabs-vertical.svelte-1hd1z3c .tab-base.svelte-1hd1z3c{flex-direction:column;border:none}.tab-button.svelte-1hd1z3c.svelte-1hd1z3c,.tab-button-base.svelte-1hd1z3c.svelte-1hd1z3c{background-color:transparent;border:0;border-radius:0;box-shadow:none;position:relative;margin-inline-start:0;margin-inline-end:0;padding-block-start:0;padding-block-end:0;padding-inline-start:0;padding-inline-end:0}.tab-button.svelte-1hd1z3c.svelte-1hd1z3c,.tab-button-skin.svelte-1hd1z3c.svelte-1hd1z3c{display:block;padding-block-start:var(--agnostic-vertical-pad, 0.5rem);padding-block-end:var(--agnostic-vertical-pad, 0.5rem);padding-inline-start:var(--agnostic-side-padding, 0.75rem);padding-inline-end:var(--agnostic-side-padding, 0.75rem);font-family:var(--agnostic-btn-font-family, var(--agnostic-font-family));font-weight:var(--agnostic-btn-font-weight, 400);font-size:var(--agnostic-btn-font-size, 1rem);line-height:var(--agnostic-line-height, var(--fluid-20, 1.25rem));color:var(--agnostic-tabs-primary, var(--agnostic-primary));text-decoration:none;transition:color var(--agnostic-timing-fast) ease-in-out,\n    background-color var(--agnostic-timing-fast) ease-in-out,\n    border-color var(--agnostic-timing-fast) ease-in-out}.tab-button.svelte-1hd1z3c.svelte-1hd1z3c:not(:first-of-type),.tab-button-base.svelte-1hd1z3c.svelte-1hd1z3c:not(:first-of-type){margin-inline-start:-1px}.tab-borderless.svelte-1hd1z3c.svelte-1hd1z3c{border:none !important}.tab-button-large.svelte-1hd1z3c.svelte-1hd1z3c{padding-block-start:calc(var(--agnostic-input-side-padding) * 1.25);padding-block-end:calc(var(--agnostic-input-side-padding) * 1.25);padding-inline-start:calc(var(--agnostic-input-side-padding) * 1.75);padding-inline-end:calc(var(--agnostic-input-side-padding) * 1.75)}.tab-button-xlarge.svelte-1hd1z3c.svelte-1hd1z3c{padding-block-start:calc(var(--agnostic-input-side-padding) * 2);padding-block-end:calc(var(--agnostic-input-side-padding) * 2);padding-inline-start:calc(var(--agnostic-input-side-padding) * 3);padding-inline-end:calc(var(--agnostic-input-side-padding) * 3)}.tab-item.tab-button.svelte-1hd1z3c.svelte-1hd1z3c{margin-block-end:-1px;background:0 0;border:1px solid transparent;border-top-left-radius:var(--agnostic-tabs-radius, 0.25rem);border-top-right-radius:var(--agnostic-tabs-radius, 0.25rem)}.tab-item.tab-button.active.svelte-1hd1z3c.svelte-1hd1z3c{color:var(--agnostic-gray-dark);background-color:#fff;border-color:var(--agnostic-gray-light) var(--agnostic-gray-light) #fff}.tab-item.svelte-1hd1z3c.svelte-1hd1z3c:hover,.tab-button.svelte-1hd1z3c.svelte-1hd1z3c:focus{border-color:var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-outline-width)\n    var(--agnostic-gray-light);isolation:isolate;cursor:pointer}.tabs-vertical.svelte-1hd1z3c .tab-button.svelte-1hd1z3c{border:none}.tab-button.svelte-1hd1z3c.svelte-1hd1z3c:disabled{color:var(--agnostic-tabas-disabled-bg, var(--agnostic-gray-mid-dark));background-color:transparent;border-color:transparent;opacity:80%}.tab-button-base.svelte-1hd1z3c.svelte-1hd1z3c:focus,.tab-panel.svelte-1hd1z3c.svelte-1hd1z3c:focus,.tab-button.svelte-1hd1z3c.svelte-1hd1z3c:focus{box-shadow:0 0 0 var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-color);outline:var(--agnostic-focus-ring-outline-width) var(--agnostic-focus-ring-outline-style)\n    var(--agnostic-focus-ring-outline-color);transition:box-shadow var(--agnostic-timing-fast) ease-out}@media screen and (prefers-reduced-motion: reduce), (update: slow){.tab-button.svelte-1hd1z3c.svelte-1hd1z3c,.tab-button-base.svelte-1hd1z3c.svelte-1hd1z3c:focus,.tab-button.svelte-1hd1z3c.svelte-1hd1z3c:focus,.tab-panel.svelte-1hd1z3c.svelte-1hd1z3c:focus,.tab-list.svelte-1hd1z3c.svelte-1hd1z3c,.tab-skinned.svelte-1hd1z3c.svelte-1hd1z3c{transition-duration:0.001ms !important}}";
    	append(document.head, style);
    }

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[22] = list[i];
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[25] = list[i];
    	child_ctx[26] = list;
    	child_ctx[27] = i;
    	return child_ctx;
    }

    // (369:6) {:else}
    function create_else_block(ctx) {
    	let button;
    	let t0_value = /*tab*/ ctx[25].title + "";
    	let t0;
    	let t1;
    	let button_disabled_value;
    	let button_class_value;
    	let button_aria_controls_value;
    	let button_tabindex_value;
    	let button_aria_selected_value;
    	let i = /*i*/ ctx[27];
    	let mounted;
    	let dispose;
    	const assign_button = () => /*button_binding*/ ctx[17](button, i);
    	const unassign_button = () => /*button_binding*/ ctx[17](null, i);

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[18](/*i*/ ctx[27]);
    	}

    	function keydown_handler_1(...args) {
    		return /*keydown_handler_1*/ ctx[19](/*i*/ ctx[27], ...args);
    	}

    	return {
    		c() {
    			button = element("button");
    			t0 = text(t0_value);
    			t1 = space();
    			button.disabled = button_disabled_value = /*isDisabled*/ ctx[2] || /*disabledOptions*/ ctx[3].includes(/*tab*/ ctx[25].title) || undefined;
    			attr(button, "class", button_class_value = "" + (null_to_empty(/*tabButtonClasses*/ ctx[9](/*tab*/ ctx[25])) + " svelte-1hd1z3c"));
    			attr(button, "role", "tab");
    			attr(button, "aria-controls", button_aria_controls_value = /*tab*/ ctx[25].ariaControls);
    			attr(button, "tabindex", button_tabindex_value = /*tab*/ ctx[25].isActive ? '0' : '-1');
    			attr(button, "aria-selected", button_aria_selected_value = /*tab*/ ctx[25].isActive);
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			append(button, t0);
    			append(button, t1);
    			assign_button();

    			if (!mounted) {
    				dispose = [
    					listen(button, "click", click_handler_1),
    					listen(button, "keydown", keydown_handler_1)
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*tabs*/ 1 && t0_value !== (t0_value = /*tab*/ ctx[25].title + "")) set_data(t0, t0_value);

    			if (dirty & /*isDisabled, disabledOptions, tabs*/ 13 && button_disabled_value !== (button_disabled_value = /*isDisabled*/ ctx[2] || /*disabledOptions*/ ctx[3].includes(/*tab*/ ctx[25].title) || undefined)) {
    				button.disabled = button_disabled_value;
    			}

    			if (dirty & /*tabs*/ 1 && button_class_value !== (button_class_value = "" + (null_to_empty(/*tabButtonClasses*/ ctx[9](/*tab*/ ctx[25])) + " svelte-1hd1z3c"))) {
    				attr(button, "class", button_class_value);
    			}

    			if (dirty & /*tabs*/ 1 && button_aria_controls_value !== (button_aria_controls_value = /*tab*/ ctx[25].ariaControls)) {
    				attr(button, "aria-controls", button_aria_controls_value);
    			}

    			if (dirty & /*tabs*/ 1 && button_tabindex_value !== (button_tabindex_value = /*tab*/ ctx[25].isActive ? '0' : '-1')) {
    				attr(button, "tabindex", button_tabindex_value);
    			}

    			if (dirty & /*tabs*/ 1 && button_aria_selected_value !== (button_aria_selected_value = /*tab*/ ctx[25].isActive)) {
    				attr(button, "aria-selected", button_aria_selected_value);
    			}

    			if (i !== /*i*/ ctx[27]) {
    				unassign_button();
    				i = /*i*/ ctx[27];
    				assign_button();
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(button);
    			unassign_button();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (355:6) {#if tab.tabButtonComponent}
    function create_if_block_1(ctx) {
    	let switch_instance;
    	let i = /*i*/ ctx[27];
    	let switch_instance_anchor;
    	let current;
    	const assign_switch_instance = () => /*switch_instance_binding*/ ctx[14](switch_instance, i);
    	const unassign_switch_instance = () => /*switch_instance_binding*/ ctx[14](null, i);

    	function click_handler() {
    		return /*click_handler*/ ctx[15](/*i*/ ctx[27]);
    	}

    	function keydown_handler(...args) {
    		return /*keydown_handler*/ ctx[16](/*i*/ ctx[27], ...args);
    	}

    	var switch_value = /*tab*/ ctx[25].tabButtonComponent;

    	function switch_props(ctx) {
    		let switch_instance_props = {
    			disabled: /*isDisabled*/ ctx[2] || /*disabledOptions*/ ctx[3].includes(/*tab*/ ctx[25].title) || undefined,
    			class: /*tabButtonClasses*/ ctx[9](/*tab*/ ctx[25]),
    			role: "tab",
    			ariaControls: /*tab*/ ctx[25].ariaControls,
    			isActive: /*tab*/ ctx[25].isActive,
    			$$slots: { default: [create_default_slot] },
    			$$scope: { ctx }
    		};

    		return { props: switch_instance_props };
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props(ctx));
    		assign_switch_instance();
    		switch_instance.$on("click", click_handler);
    		switch_instance.$on("keydown", keydown_handler);
    	}

    	return {
    		c() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (i !== /*i*/ ctx[27]) {
    				unassign_switch_instance();
    				i = /*i*/ ctx[27];
    				assign_switch_instance();
    			}

    			const switch_instance_changes = {};
    			if (dirty & /*isDisabled, disabledOptions, tabs*/ 13) switch_instance_changes.disabled = /*isDisabled*/ ctx[2] || /*disabledOptions*/ ctx[3].includes(/*tab*/ ctx[25].title) || undefined;
    			if (dirty & /*tabs*/ 1) switch_instance_changes.class = /*tabButtonClasses*/ ctx[9](/*tab*/ ctx[25]);
    			if (dirty & /*tabs*/ 1) switch_instance_changes.ariaControls = /*tab*/ ctx[25].ariaControls;
    			if (dirty & /*tabs*/ 1) switch_instance_changes.isActive = /*tab*/ ctx[25].isActive;

    			if (dirty & /*$$scope, tabs*/ 268435457) {
    				switch_instance_changes.$$scope = { dirty, ctx };
    			}

    			if (switch_value !== (switch_value = /*tab*/ ctx[25].tabButtonComponent)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					assign_switch_instance();
    					switch_instance.$on("click", click_handler);
    					switch_instance.$on("keydown", keydown_handler);
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			unassign_switch_instance();
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    // (356:8) <svelte:component           this="{tab.tabButtonComponent}"           bind:this="{dynamicComponentRefs[i]}"           on:click="{() => selectTab(i)}"           on:keydown="{(e) => handleKeyDown(e, i)}"           disabled="{isDisabled || disabledOptions.includes(tab.title) || undefined}"           class="{tabButtonClasses(tab)}"           role="tab"           ariaControls="{tab.ariaControls}"           isActive="{tab.isActive}"         >
    function create_default_slot(ctx) {
    	let t0_value = /*tab*/ ctx[25].title + "";
    	let t0;
    	let t1;

    	return {
    		c() {
    			t0 = text(t0_value);
    			t1 = space();
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, t1, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty & /*tabs*/ 1 && t0_value !== (t0_value = /*tab*/ ctx[25].title + "")) set_data(t0, t0_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(t1);
    		}
    	};
    }

    // (354:4) {#each tabs as tab, i}
    function create_each_block_1(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*tab*/ ctx[25].tabButtonComponent) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (387:4) {#if panel.isActive}
    function create_if_block(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;
    	var switch_value = /*panel*/ ctx[22].tabPanelComponent;

    	function switch_props(ctx) {
    		return { props: { tabindex: "0" } };
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	return {
    		c() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		m(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (switch_value !== (switch_value = /*panel*/ ctx[22].tabPanelComponent)) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};
    }

    // (386:2) {#each tabs as panel}
    function create_each_block(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*panel*/ ctx[22].isActive && create_if_block(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*panel*/ ctx[22].isActive) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*tabs*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let div1;
    	let div0;
    	let div0_aria_orientation_value;
    	let t;
    	let current;
    	let each_value_1 = /*tabs*/ ctx[0];
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const out = i => transition_out(each_blocks_1[i], 1, 1, () => {
    		each_blocks_1[i] = null;
    	});

    	let each_value = /*tabs*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out_1 = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			div1 = element("div");
    			div0 = element("div");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t = space();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr(div0, "class", "" + (null_to_empty(/*tablistClasses*/ ctx[8]()) + " svelte-1hd1z3c"));
    			attr(div0, "role", "tablist");

    			attr(div0, "aria-orientation", div0_aria_orientation_value = /*isVerticalOrientation*/ ctx[1]
    			? 'vertical'
    			: 'horizontal');

    			attr(div1, "class", "" + (null_to_empty(/*baseStyles*/ ctx[6]()) + " svelte-1hd1z3c"));
    		},
    		m(target, anchor) {
    			insert(target, div1, anchor);
    			append(div1, div0);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div0, null);
    			}

    			append(div1, t);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div1, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*tabs, isDisabled, disabledOptions, undefined, tabButtonClasses, dynamicComponentRefs, selectTab, handleKeyDown, tabButtonRefs*/ 1725) {
    				each_value_1 = /*tabs*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    						transition_in(each_blocks_1[i], 1);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						transition_in(each_blocks_1[i], 1);
    						each_blocks_1[i].m(div0, null);
    					}
    				}

    				group_outros();

    				for (i = each_value_1.length; i < each_blocks_1.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if (!current || dirty & /*isVerticalOrientation*/ 2 && div0_aria_orientation_value !== (div0_aria_orientation_value = /*isVerticalOrientation*/ ctx[1]
    			? 'vertical'
    			: 'horizontal')) {
    				attr(div0, "aria-orientation", div0_aria_orientation_value);
    			}

    			if (dirty & /*tabs*/ 1) {
    				each_value = /*tabs*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div1, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out_1(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value_1.length; i += 1) {
    				transition_in(each_blocks_1[i]);
    			}

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks_1 = each_blocks_1.filter(Boolean);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				transition_out(each_blocks_1[i]);
    			}

    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div1);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { size = "" } = $$props;
    	let { tabs = [] } = $$props;
    	let { isBorderless = false } = $$props;
    	let { isVerticalOrientation = false } = $$props;
    	let { isDisabled = false } = $$props;
    	let { disabledOptions = [] } = $$props;
    	let { isSkinned = true } = $$props;

    	/**
     * Explanation: we have two ways that the tab buttons get created:
     * 1. The `tabs` input array has dynamic `tabButtonComponent` components.
     * 2. The `tabs` has no `tabButtonComponent` and so we generate the tab
     * button internally.
     *
     * As such, the `dynamicComponentRefs` below are refs for case 1. and
     * `tabButtonRefs` are refs for case 2.
     */
    	let dynamicComponentRefs = []; //https://svelte.dev/tutorial/component-this

    	let tabButtonRefs = [];

    	// tabButtonRefs.filter(el => el);
    	// $: console.log(tabButtonRefs);
    	// onMount(() => {
    	//   console.log(tabButtonRefs);
    	// });
    	const baseStyles = () => `tabs ${isVerticalOrientation ? "tabs-vertical" : ""}`;

    	const selectTab = index => {
    		$$invalidate(0, tabs = tabs.map((tab, i) => {
    			tab.isActive = index === i ? true : false;
    			return tab;
    		}));
    	};

    	let activeTabs = tabs.filter(tab => tab.isActive);

    	if (activeTabs.length === 0) {
    		selectTab(0);
    	}

    	const tablistClasses = () => {
    		const tabListClass = isSkinned ? "tab-list" : "tab-list-base";
    		return [tabListClass, isBorderless ? `tab-borderless` : ""].filter(klass => klass.length).join(" ");
    	};

    	const tabButtonClasses = tab => {
    		const klasses = [
    			`tab-item`,
    			`tab-button`,
    			tab.isActive ? "active" : "",
    			size === "large" ? "tab-button-large" : "",
    			size === "xlarge" ? "tab-button-xlarge" : ""
    		];

    		return klasses.filter(klass => klass.length).join(" ");
    	};

    	const focusTab = (index, direction) => {
    		// console.log("tabButtonRefs: ", tabButtonRefs);
    		// console.log("dynamicComponentRefs: ", dynamicComponentRefs);
    		/**
     * direction is optional because we only need that when we're arrow navigating.
     * If they've hit ENTER|SPACE we're focusing the current item. If HOME focus(0).
     * If END focus(tabButtons.length - 1)...and so on.
     */
    		let i = index;

    		if (direction === "asc") {
    			i += 1;
    		} else if (direction === "desc") {
    			i -= 1;
    		}

    		// Circular navigation
    		//
    		// If we've went beyond "start" circle around to last
    		if (i < 0) {
    			i = tabs.length - 1;
    		} else if (i >= tabs.length) {
    			// We've went beyond "last" so circle around to first
    			i = 0;
    		}

    		/**
     * Figure out at run-time whether this was build with dynamicComponentRefs (consumer
     * used their own tabButtonComponent), or tabButtonRefs (we generated the buttons here)
     */
    		let nextTab;

    		if (tabButtonRefs.length) {
    			nextTab = tabButtonRefs[i];
    		} else if (dynamicComponentRefs.length) {
    			// Same logic as above, but we're using the binding to component instance
    			nextTab = dynamicComponentRefs[i];
    		}

    		// Edge case: We hit a tab button that's been disabled. If so, we recurse, but
    		// only if we've been supplied a `direction`. Otherwise, nothing left to do.
    		if (nextTab.isDisabled && nextTab.isDisabled() || nextTab.disabled && direction) {
    			// Retry with new `i` index going in same direction
    			focusTab(i, direction);
    		} else {
    			// Nominal case is to just focs next tab :)
    			nextTab.focus();
    		}
    	};

    	const handleKeyDown = (ev, index) => {
    		switch (ev.key) {
    			case "Up":
    			case "ArrowUp":
    				if (isVerticalOrientation) {
    					focusTab(index, "desc");
    				}
    				break;
    			case "Down":
    			case "ArrowDown":
    				if (isVerticalOrientation) {
    					focusTab(index, "asc");
    				}
    				break;
    			case "Left":
    			case "ArrowLeft":
    				if (!isVerticalOrientation) {
    					focusTab(index, "desc");
    				}
    				break;
    			case "Right":
    			case "ArrowRight":
    				if (!isVerticalOrientation) {
    					focusTab(index, "asc");
    				}
    				break;
    			case "Home":
    			case "ArrowHome":
    				focusTab(0);
    				break;
    			case "End":
    			case "ArrowEnd":
    				focusTab(tabs.length - 1);
    				break;
    			case "Enter":
    			case "Space":
    				focusTab(index);
    				selectTab(index);
    				break;
    			default:
    				return;
    		}

    		ev.preventDefault();
    	};

    	function switch_instance_binding($$value, i) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			dynamicComponentRefs[i] = $$value;
    			$$invalidate(4, dynamicComponentRefs);
    		});
    	}

    	const click_handler = i => selectTab(i);
    	const keydown_handler = (i, e) => handleKeyDown(e, i);

    	function button_binding($$value, i) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			tabButtonRefs[i] = $$value;
    			$$invalidate(5, tabButtonRefs);
    		});
    	}

    	const click_handler_1 = i => selectTab(i);
    	const keydown_handler_1 = (i, e) => handleKeyDown(e, i);

    	$$self.$$set = $$props => {
    		if ('size' in $$props) $$invalidate(11, size = $$props.size);
    		if ('tabs' in $$props) $$invalidate(0, tabs = $$props.tabs);
    		if ('isBorderless' in $$props) $$invalidate(12, isBorderless = $$props.isBorderless);
    		if ('isVerticalOrientation' in $$props) $$invalidate(1, isVerticalOrientation = $$props.isVerticalOrientation);
    		if ('isDisabled' in $$props) $$invalidate(2, isDisabled = $$props.isDisabled);
    		if ('disabledOptions' in $$props) $$invalidate(3, disabledOptions = $$props.disabledOptions);
    		if ('isSkinned' in $$props) $$invalidate(13, isSkinned = $$props.isSkinned);
    	};

    	$$invalidate(4, dynamicComponentRefs = []);

    	// dynamicComponentRefs.filter(el => el);
    	// $: console.log(dynamicComponentRefs);
    	$$invalidate(5, tabButtonRefs = []);

    	return [
    		tabs,
    		isVerticalOrientation,
    		isDisabled,
    		disabledOptions,
    		dynamicComponentRefs,
    		tabButtonRefs,
    		baseStyles,
    		selectTab,
    		tablistClasses,
    		tabButtonClasses,
    		handleKeyDown,
    		size,
    		isBorderless,
    		isSkinned,
    		switch_instance_binding,
    		click_handler,
    		keydown_handler,
    		button_binding,
    		click_handler_1,
    		keydown_handler_1
    	];
    }

    class Tabs extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-1hd1z3c-style")) add_css$1();

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			size: 11,
    			tabs: 0,
    			isBorderless: 12,
    			isVerticalOrientation: 1,
    			isDisabled: 2,
    			disabledOptions: 3,
    			isSkinned: 13
    		});
    	}
    }

    var Tabs$1 = Tabs;

    /* src/stories/Tag.svelte generated by Svelte v3.39.0 */

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-qz5ast-style";
    	style.textContent = ".tag-base.svelte-qz5ast,.tag.svelte-qz5ast{display:inline-flex;justify-content:center;white-space:nowrap}.tag-skin.svelte-qz5ast,.tag.svelte-qz5ast{background-color:var(--agnostic-gray-light);color:var(--agnostic-dark);font-size:var(--fluid-12);line-height:var(--agnostic-line-height, var(--fluid-20, 1.25rem));padding-block-start:var(--fluid-2);padding-block-end:var(--fluid-2);padding-inline-start:var(--fluid-8);padding-inline-end:var(--fluid-8)}.tag-info.svelte-qz5ast{background:var(--agnostic-primary-light);color:var(--agnostic-primary-dark)}.tag-warning.svelte-qz5ast{background:var(--agnostic-warning-light);color:var(--agnostic-warning-dark)}.tag-error.svelte-qz5ast{background:var(--agnostic-error-light);color:var(--agnostic-error-dark)}.tag-success.svelte-qz5ast{background:var(--agnostic-action-light);color:var(--agnostic-action-from)}.tag-upper.svelte-qz5ast{font-size:var(--fluid-10);text-transform:uppercase}.tag-circle.svelte-qz5ast{border-radius:50%}.tag-round.svelte-qz5ast{border-radius:var(--agnostic-radius)}.tag-pill.svelte-qz5ast{border-radius:200px}";
    	append(document.head, style);
    }

    function create_fragment(ctx) {
    	let span;
    	let current;
    	const default_slot_template = /*#slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

    	return {
    		c() {
    			span = element("span");
    			if (default_slot) default_slot.c();
    			attr(span, "class", "" + (null_to_empty(/*tagClasses*/ ctx[0]) + " svelte-qz5ast"));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);

    			if (default_slot) {
    				default_slot.m(span, null);
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 32)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[5], !current ? -1 : dirty, null, null);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { isUppercase = false } = $$props;
    	let { isSkinned = true } = $$props;
    	let { type = "" } = $$props;
    	let { shape = "" } = $$props;

    	const tagClasses = [
    		isSkinned ? "tag" : "tag-base",
    		type ? `tag-${type}` : "",
    		shape ? `tag-${shape}` : "",
    		isUppercase ? "tag-upper" : ""
    	].filter(c => c).join(" ");

    	$$self.$$set = $$props => {
    		if ('isUppercase' in $$props) $$invalidate(1, isUppercase = $$props.isUppercase);
    		if ('isSkinned' in $$props) $$invalidate(2, isSkinned = $$props.isSkinned);
    		if ('type' in $$props) $$invalidate(3, type = $$props.type);
    		if ('shape' in $$props) $$invalidate(4, shape = $$props.shape);
    		if ('$$scope' in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	return [tagClasses, isUppercase, isSkinned, type, shape, $$scope, slots];
    }

    class Tag extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-qz5ast-style")) add_css();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			isUppercase: 1,
    			isSkinned: 2,
    			type: 3,
    			shape: 4
    		});
    	}
    }

    var Tag$1 = Tag;

    exports.Alert = Alert$1;
    exports.Avatar = Avatar$1;
    exports.AvatarGroup = AvatarGroup$1;
    exports.Breadcrumb = Breadcrumb$1;
    exports.Button = Button$1;
    exports.ButtonGroup = ButtonGroup$1;
    exports.Card = Card$1;
    exports.ChoiceInput = ChoiceInput$1;
    exports.Close = Close$1;
    exports.Disclose = Disclose$1;
    exports.Header = Header$1;
    exports.HeaderNav = HeaderNav$1;
    exports.HeaderNavItem = HeaderNavItem$1;
    exports.Icon = Icon$1;
    exports.Input = Input$1;
    exports.InputAddonItem = InputAddonItem$1;
    exports.Progress = Progress$1;
    exports.Select = Select$1;
    exports.Switch = Switch$1;
    exports.Tabs = Tabs$1;
    exports.Tag = Tag$1;

    Object.defineProperty(exports, '__esModule', { value: true });

}));
