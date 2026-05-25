---
title: Science & Math Showcase
tags: [demo, math, physics, quantum]
---

# Science & Math Showcase

Hover any display equation to **Copy LaTeX** or **Expand** it. Long equations scroll sideways instead of breaking the page.

## Algebra

The quadratic formula: $x = \dfrac{-b \pm \sqrt{b^2 - 4ac}}{2a}$.

$$
(a+b)^2 = a^2 + 2ab + b^2 \qquad a^3 - b^3 = (a-b)(a^2 + ab + b^2)
$$

## Calculus

Derivative, partial derivative, integral, limit, sum and product:

$$
\frac{d}{dx}e^{x} = e^{x}, \quad
\frac{\partial f}{\partial x}, \quad
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}, \quad
\lim_{n\to\infty}\left(1+\tfrac{1}{n}\right)^n = e
$$

$$
\sum_{n=1}^{\infty}\frac{1}{n^2} = \frac{\pi^2}{6} \qquad \prod_{k=1}^{n} k = n!
$$

## Linear algebra (matrices, vectors, tensors)

$$
A = \begin{pmatrix} a_{11} & a_{12} \\ a_{21} & a_{22} \end{pmatrix}, \quad
\vec{v} = \begin{bmatrix} x \\ y \\ z \end{bmatrix}, \quad
\det(A) = a_{11}a_{22} - a_{12}a_{21}
$$

## Physics — constants, units, Maxwell & relativity

Planck constant $h = 6.626\times10^{-34}\ \mathrm{J{\cdot}s}$, speed of light $c = 3.0\times10^{8}\ \mathrm{m/s}$.

$$
E = mc^2 \qquad E^2 = (pc)^2 + (mc^2)^2
$$

Maxwell's equations (differential form):

$$
\nabla\cdot\mathbf{E} = \frac{\rho}{\varepsilon_0}, \quad
\nabla\cdot\mathbf{B} = 0, \quad
\nabla\times\mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}, \quad
\nabla\times\mathbf{B} = \mu_0\mathbf{J} + \mu_0\varepsilon_0\frac{\partial \mathbf{E}}{\partial t}
$$

## Quantum mechanics (Dirac notation, operators, Schrödinger)

Bra–ket and an operator expectation value: $\langle \psi | \hat{H} | \psi \rangle$.

$$
i\hbar\frac{\partial}{\partial t}\,|\psi(t)\rangle = \hat{H}\,|\psi(t)\rangle
$$

$$
\hat{H} = -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}), \qquad
|\psi\rangle = \alpha|0\rangle + \beta|1\rangle,\ \ |\alpha|^2 + |\beta|^2 = 1
$$

## Quantum computing

A Hadamard gate on $|0\rangle$ and a Bell state:

$$
H|0\rangle = \tfrac{1}{\sqrt{2}}\big(|0\rangle + |1\rangle\big), \qquad
|\Phi^+\rangle = \tfrac{1}{\sqrt{2}}\big(|00\rangle + |11\rangle\big)
$$

## Statistics

Normal distribution and Bayes' theorem:

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}}\,e^{-\frac{(x-\mu)^2}{2\sigma^2}} \qquad
P(A\mid B) = \frac{P(B\mid A)\,P(A)}{P(B)}
$$

## Engineering

Ohm's law and a transfer function:

$$
V = IR \qquad H(s) = \frac{\omega_n^2}{s^2 + 2\zeta\omega_n s + \omega_n^2}
$$

## Genetics

Hardy–Weinberg equilibrium and a genotype table:

$$
p^2 + 2pq + q^2 = 1
$$

| Cross   | AA  | Aa  | aa  |
| ------- | --- | --- | --- |
| Aa × Aa | 25% | 50% | 25% |

## Chemistry (mhchem)

$$
\ce{2H2 + O2 -> 2H2O} \qquad \ce{CO2 + H2O <=> H2CO3}
$$

## Long equation (scrolls horizontally)

$$
f(x) = a_0 + \sum_{n=1}^{\infty}\Big(a_n\cos\tfrac{n\pi x}{L} + b_n\sin\tfrac{n\pi x}{L}\Big) = a_0 + a_1\cos\tfrac{\pi x}{L} + b_1\sin\tfrac{\pi x}{L} + a_2\cos\tfrac{2\pi x}{L} + b_2\sin\tfrac{2\pi x}{L} + \cdots
$$
