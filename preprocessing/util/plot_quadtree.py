import matplotlib.pyplot as plt
import matplotlib.patches

def plot_quadtree(tree, curve=None):
    fig = plt.figure(figsize=(10,10))

    fig.gca().set_xlim((0,100))
    fig.gca().set_ylim((0,100))

    _plot_node(fig.gca(), tree.root)

    if curve is not None:
        fig.gca().plot(*curve, 'r-')

    plt.show()


def _plot_node(ax, node):
    r = matplotlib.patches.Rectangle((node.x0, node.y0), node.x1 - node.x0, node.y1 - node.y0,
            fill=False,
            edgecolor='black',
            linewidth=1)

    ax.add_patch(r)
    if node.children is not None:
        for child in node.children:
            _plot_node(ax, child)

    elif node.datum is not None:
        c = matplotlib.patches.Circle((node.datum.x, node.datum.y), radius=0.2, color='blue')
        ax.add_patch(c)
